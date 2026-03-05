import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { listUCSMessages, createUCSMessage } from "@/lib/ucs/storage";
import { CreateUCSSchema } from "@/lib/ucs/schema";

export async function GET(req: NextRequest) {
  const user = await requireAuth();
  const { searchParams } = req.nextUrl;
  const brandMode = searchParams.get("brandMode") as any ?? undefined;
  const status = searchParams.get("status") as any ?? undefined;

  const messages = await listUCSMessages({ brandMode, status });
  return NextResponse.json(messages);
}

export async function POST(req: NextRequest) {
  const user = await requireAuth();
  const body = await req.json();

  const parsed = CreateUCSSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", issues: parsed.error.issues }, { status: 400 });
  }

  const message = await createUCSMessage(parsed.data, user.id);
  return NextResponse.json(message, { status: 201 });
}
