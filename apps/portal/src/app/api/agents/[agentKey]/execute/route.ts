import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { createHash } from "crypto";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { AGENTS, executeAgent } from "@/lib/agentGateway";
import type { FileAttachment } from "@/lib/agentGateway";
import { getFilePath } from "@/lib/storage";
import { validateAgentOutputMarkdown } from "@/lib/agentOutput/validate";
import { validateProviderId, getProvider } from "@/lib/llmProviders";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ agentKey: string }> }
) {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { agentKey } = await params;

  if (!AGENTS[agentKey]) {
    return NextResponse.json({ error: `Unknown agent: ${agentKey}` }, { status: 404 });
  }

  const body = await req.json();
  const { runId, inputs, parentExecId, providerId, attemptNumber } = body;

  if (!runId) {
    return NextResponse.json({ error: "runId is required" }, { status: 400 });
  }

  // Validate provider if specified
  if (providerId !== undefined && providerId !== "") {
    if (!validateProviderId(providerId)) {
      return NextResponse.json(
        { errorCode: "UNKNOWN_PROVIDER", error: `Unknown provider: "${providerId}". Use anthropic, openai, or grok.` },
        { status: 400 }
      );
    }
    const prov = getProvider(providerId);
    if (!prov?.available) {
      return NextResponse.json(
        {
          errorCode: "PROVIDER_NOT_CONFIGURED",
          error: `${prov?.displayName} is not configured. Set ${prov?.apiKeyEnvVar} in the environment.`,
        },
        { status: 400 }
      );
    }
  }

  // Verify run exists and get project info
  const run = await db.run.findUnique({
    where: { id: runId },
    include: { project: true },
  });
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  // Load project-level reference docs to send as files
  const projectDocs = await db.asset.findMany({
    where: { projectId: run.projectId, scope: "project" },
  });

  const files: FileAttachment[] = [];
  for (const doc of projectDocs) {
    try {
      const fullPath = getFilePath(doc.storagePath);
      const buffer = fs.readFileSync(fullPath);
      files.push({ filename: doc.filename, buffer, mimeType: doc.mimeType });
    } catch {
      // Skip files that can't be read (deleted from disk, etc.)
    }
  }

  // Track which files were sent
  const inputFilesMeta = projectDocs.map((d) => ({
    assetId: d.id,
    filename: d.filename,
    scope: "project",
  }));

  // Enrich inputs with provider + attempt metadata (persisted for history badges)
  const enrichedInputs = {
    ...(inputs || {}),
    ...(providerId ? { _providerId: providerId } : {}),
    ...(attemptNumber && Number(attemptNumber) > 1 ? { _attemptNumber: String(attemptNumber) } : {}),
  };

  // Create execution record (pending)
  const exec = await db.agentExecution.create({
    data: {
      runId,
      agentKey,
      status: "pending",
      inputs: enrichedInputs,
      inputFiles: inputFilesMeta,
      parentExecId: parentExecId || null,
      createdByUserId: user.id,
    },
  });

  // Update to running
  await db.agentExecution.update({
    where: { id: exec.id },
    data: { status: "running", startedAt: new Date() },
  });

  // Always inject run_id so agents can include it in their Markdown frontmatter
  const agentInputs = { ...enrichedInputs, run_id: runId };

  // Call the agent — include project docs as file attachments
  const result = await executeAgent(agentKey, agentInputs, files, {
    providerId: providerId || undefined,
  });

  // Update AgentExecution with result
  const updated = await db.agentExecution.update({
    where: { id: exec.id },
    data: {
      status: result.ok ? "completed" : "failed",
      output: result.result || "",
      error: result.error || null,
      completedAt: new Date(),
      durationMs: result.durationMs,
    },
  });

  // ── Validate + store RunStep ────────────────────────────────────────────────
  let runStep: {
    id: string;
    status: string;
    hash: string | null;
    validationErrors: string[];
    validationWarnings: string[];
  } | null = null;

  if (result.ok && result.result) {
    const validation = validateAgentOutputMarkdown(result.result);
    const hash = createHash("sha256")
      .update(result.result)
      .digest("hex")
      .slice(0, 16);

    // Resolve input step linkage via parent execution
    let inputStepId: string | null = null;
    if (parentExecId) {
      const parentStep = await db.runStep.findUnique({
        where: { agentExecutionId: parentExecId },
        select: { id: true },
      });
      inputStepId = parentStep?.id ?? null;
    }

    runStep = await db.runStep.create({
      data: {
        runId,
        step: agentKey,
        agentExecutionId: exec.id,
        status: validation.ok ? "ok" : "invalid",
        markdownOutput: result.result,
        jsonPayload: {
          agentKey,
          inputs: inputs || {},
          durationMs: result.durationMs,
        },
        validationErrors: validation.errors,
        validationWarnings: validation.warnings,
        inputStepId,
        hash,
      },
      select: {
        id: true,
        status: true,
        hash: true,
        validationErrors: true,
        validationWarnings: true,
      },
    });
  } else if (!result.ok) {
    // Agent returned an error — store a RunStep with error status
    runStep = await db.runStep.create({
      data: {
        runId,
        step: agentKey,
        agentExecutionId: exec.id,
        status: "error",
        markdownOutput: result.result || null,
        jsonPayload: { agentKey, inputs: inputs || {}, error: result.error },
        validationErrors: result.error ? [result.error] : [],
        validationWarnings: [],
        hash: null,
      },
      select: {
        id: true,
        status: true,
        hash: true,
        validationErrors: true,
        validationWarnings: true,
      },
    });
  }

  return NextResponse.json({
    ...updated,
    runStep,
  });
}
