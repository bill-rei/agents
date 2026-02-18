import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { AGENTS, executeAgent } from "@/lib/agentGateway";

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

  // Verify run exists
  const run = await db.run.findUnique({ where: { id: runId } });
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  // Create execution record (pending)
  const exec = await db.agentExecution.create({
    data: {
      runId,
      agentKey,
      status: "pending",
      inputs: inputs || {},
      parentExecId: parentExecId || null,
      createdByUserId: user.id,
    },
  });

  // Update to running
  await db.agentExecution.update({
    where: { id: exec.id },
    data: { status: "running", startedAt: new Date() },
  });

  // Call the agent
  const result = await executeAgent(agentKey, inputs || {});

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
