import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getUCSMessage } from "@/lib/ucs/storage";
import { saveAsset, listAssets } from "@/services/mediaStore";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  await requireAuth();
  const assets = await listAssets(params.id);
  return NextResponse.json(assets);
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  await requireAuth();

  const msg = await getUCSMessage(params.id);
  if (!msg) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await saveAsset(buffer, {
    brandMode: msg.brandMode,
    campaignId: params.id,
    filename: file.name,
    mime: file.type,
  });

  return NextResponse.json({ ref: result.ref }, { status: 201 });
}
