import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ execId: string }> }
) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { execId } = await params;

  const exec = await db.agentExecution.findUnique({
    where: { id: execId },
    include: {
      createdBy: { select: { name: true } },
      parentExec: { select: { id: true, agentKey: true } },
      childExecs: { select: { id: true, agentKey: true, status: true, createdAt: true } },
    },
  });

  if (!exec) {
    return NextResponse.json({ error: "Execution not found" }, { status: 404 });
  }

  return NextResponse.json(exec);
}
