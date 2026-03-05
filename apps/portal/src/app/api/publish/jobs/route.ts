import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ucsMessageId = req.nextUrl.searchParams.get("ucsMessageId");
  if (!ucsMessageId) return NextResponse.json({ error: "ucsMessageId required" }, { status: 400 });

  const jobs = await db.ucsPublishJob.findMany({
    where: { ucsMessageId },
    include: {
      events: { orderBy: { ts: "asc" } },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(jobs);
}
