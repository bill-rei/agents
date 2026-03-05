import { NextRequest, NextResponse } from "next/server";
import { createMessage, listMessages } from "@/lib/mock";
import type { CreateMessagePayload } from "@/lib/types";

export async function GET() {
  return NextResponse.json({ messages: listMessages() });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as CreateMessagePayload | null;
  if (!body?.idea || !body?.brand || !body?.channels?.length) {
    return NextResponse.json({ error: "idea, brand, and channels are required" }, { status: 400 });
  }
  const msg = createMessage(body, "You");
  return NextResponse.json({ id: msg.id, message: msg }, { status: 201 });
}
