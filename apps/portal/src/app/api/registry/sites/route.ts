import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { listSitesWithPages } from "@/lib/targetRegistry";

export async function GET() {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const sites = listSitesWithPages();
    return NextResponse.json(sites);
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to load target registry: ${(err as Error).message}` },
      { status: 500 }
    );
  }
}
