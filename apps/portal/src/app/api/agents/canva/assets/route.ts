/**
 * GET /api/agents/canva/assets?artifactId=...
 *
 * Returns all Canva-generated assets attached to an artifact.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const artifactId = req.nextUrl.searchParams.get("artifactId");
  if (!artifactId) {
    return NextResponse.json({ error: "artifactId is required" }, { status: 400 });
  }

  const assets = await db.canvaAsset.findMany({
    where: { artifactId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      wpUrl: true,
      wpMediaId: true,
      wpSite: true,
      meta: true,
      createdAt: true,
      createdBy: { select: { name: true } },
    },
  });

  return NextResponse.json(assets);
}
