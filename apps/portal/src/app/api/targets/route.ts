import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { listAllTargets } from "@/lib/targetRegistry";

/**
 * GET /api/targets
 *
 * Returns all registered target sites. The UI uses this to populate
 * the site selector in the Website Job wizard. Pass ?type=web to
 * filter to web targets only.
 */
export async function GET(req: Request) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const typeFilter = searchParams.get("type"); // "web" | "social" | null

  let targets = listAllTargets();
  if (typeFilter) {
    targets = targets.filter((t) => t.type === typeFilter);
  }

  return NextResponse.json({ targets });
}
