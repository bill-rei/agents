import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { listAllTargets } from "@/lib/targetRegistry";

export async function GET() {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const targets = listAllTargets();
    return NextResponse.json(targets);
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to load target registry: ${(err as Error).message}` },
      { status: 500 }
    );
  }
}
