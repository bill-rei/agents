import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ artifactId: string; assetId: string }> }
) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { artifactId, assetId } = await params;
  const body = await req.json();

  const existing = await db.artifactAsset.findUnique({
    where: { assetId_artifactId: { assetId, artifactId } },
  });
  if (!existing) {
    return NextResponse.json({ error: "Link not found" }, { status: 404 });
  }

  const updated = await db.artifactAsset.update({
    where: { id: existing.id },
    data: {
      ...(body.placement !== undefined && { placement: body.placement }),
      ...(body.alignment !== undefined && { alignment: body.alignment || null }),
      ...(body.size !== undefined && { size: body.size || null }),
      ...(body.intent !== undefined && { intent: body.intent }),
      ...(body.order !== undefined && { order: body.order }),
      ...(body.alt !== undefined && { alt: body.alt }),
      ...(body.caption !== undefined && { caption: body.caption || null }),
    },
    include: { asset: true },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ artifactId: string; assetId: string }> }
) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { artifactId, assetId } = await params;

  const existing = await db.artifactAsset.findUnique({
    where: { assetId_artifactId: { assetId, artifactId } },
  });
  if (!existing) {
    return NextResponse.json({ error: "Link not found" }, { status: 404 });
  }

  await db.artifactAsset.delete({ where: { id: existing.id } });
  return NextResponse.json({ ok: true });
}
