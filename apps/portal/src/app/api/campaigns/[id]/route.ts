import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getUCSMessage, updateUCSMessage } from "@/lib/ucs/storage";
import { UpdateUCSSchema } from "@/lib/ucs/schema";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  await requireAuth();
  const message = await getUCSMessage(params.id);
  if (!message) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(message);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  await requireAuth();
  const body = await req.json();

  const parsed = UpdateUCSSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  }

  const message = await updateUCSMessage(params.id, parsed.data);
  if (!message) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(message);
}
