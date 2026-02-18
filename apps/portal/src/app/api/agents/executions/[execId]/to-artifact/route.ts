import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ execId: string }> }
) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { execId } = await params;
  const body = await req.json();
  const { type, title } = body;

  const exec = await db.agentExecution.findUnique({
    where: { id: execId },
  });

  if (!exec) {
    return NextResponse.json({ error: "Execution not found" }, { status: 404 });
  }

  if (exec.status !== "completed") {
    return NextResponse.json({ error: "Can only promote completed executions" }, { status: 400 });
  }

  const artifact = await db.artifact.create({
    data: {
      runId: exec.runId,
      type: type || "social_post",
      title: title || `${exec.agentKey} output`,
      content: exec.output,
      status: "draft",
      metadata: { sourceExecId: exec.id, sourceAgent: exec.agentKey },
    },
  });

  return NextResponse.json(artifact);
}
