import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { AGENT_LIST, checkAgentHealth } from "@/lib/agentGateway";

export async function GET() {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const health = await checkAgentHealth();

  return NextResponse.json({
    agents: AGENT_LIST.map((a) => ({
      ...a,
      online: health[a.key] ?? false,
    })),
  });
}
