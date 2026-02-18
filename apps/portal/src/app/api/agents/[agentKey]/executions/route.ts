import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { AGENTS } from "@/lib/agentGateway";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ agentKey: string }> }
) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { agentKey } = await params;

  if (!AGENTS[agentKey]) {
    return NextResponse.json({ error: `Unknown agent: ${agentKey}` }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const runId = searchParams.get("runId");
  const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10), 100);
  const cursor = searchParams.get("cursor");

  const executions = await db.agentExecution.findMany({
    where: {
      agentKey,
      ...(runId ? { runId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      createdBy: { select: { name: true } },
      parentExec: { select: { id: true, agentKey: true } },
    },
  });

  const hasMore = executions.length > limit;
  const items = hasMore ? executions.slice(0, limit) : executions;
  const nextCursor = hasMore ? items[items.length - 1].id : null;

  return NextResponse.json({ items, nextCursor });
}
