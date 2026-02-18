import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { checkAgentHealth } from "@/lib/agentGateway";

export async function GET() {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const health = await checkAgentHealth();
  return NextResponse.json(health);
}
