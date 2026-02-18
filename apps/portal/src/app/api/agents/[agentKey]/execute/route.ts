import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { AGENTS, executeAgent } from "@/lib/agentGateway";
import type { FileAttachment } from "@/lib/agentGateway";
import { getFilePath } from "@/lib/storage";

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
  const { runId, inputs, parentExecId } = body;

  if (!runId) {
    return NextResponse.json({ error: "runId is required" }, { status: 400 });
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

  // Create execution record (pending)
  const exec = await db.agentExecution.create({
    data: {
      runId,
      agentKey,
      status: "pending",
      inputs: inputs || {},
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

  // Call the agent — include project docs as file attachments
  const result = await executeAgent(agentKey, inputs || {}, files);

  // Update with result
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

  return NextResponse.json(updated);
}
