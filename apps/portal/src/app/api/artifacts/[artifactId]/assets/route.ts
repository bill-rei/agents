import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ artifactId: string }> }
) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { artifactId } = await params;

  const links = await db.artifactAsset.findMany({
    where: { artifactId },
    include: { asset: true },
    orderBy: { order: "asc" },
  });

  return NextResponse.json(links);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ artifactId: string }> }
) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { artifactId } = await params;
  const body = await req.json();
  const { assetId, placement, alignment, size, intent, alt, caption } = body;

  if (!assetId) {
    return NextResponse.json({ error: "assetId is required" }, { status: 400 });
  }

  // Auto-increment order
  const maxOrder = await db.artifactAsset.aggregate({
    where: { artifactId },
    _max: { order: true },
  });
  const nextOrder = (maxOrder._max.order ?? -1) + 1;

  const link = await db.artifactAsset.create({
    data: {
      artifactId,
      assetId,
      placement: placement || "below",
      alignment: alignment || null,
      size: size || null,
      intent: intent || "section",
      order: nextOrder,
      alt: alt || "",
      caption: caption || null,
    },
    include: { asset: true },
  });

  return NextResponse.json(link, { status: 201 });
}
