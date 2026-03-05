import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { canApprove } from "@/lib/authorization";
import { db } from "@/lib/db";

interface CreateJobsBody {
  ucsMessageId: string;
  platforms: ("x" | "linkedin")[];
  scheduledFor?: string; // ISO string — if provided, jobs are "scheduled" not "queued"
  approveNow?: boolean;  // if true, also sets UCS status to "approved"
}

export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json() as CreateJobsBody;
  const { ucsMessageId, platforms, scheduledFor, approveNow } = body;

  if (!ucsMessageId) return NextResponse.json({ error: "ucsMessageId required" }, { status: 400 });
  if (!platforms?.length) return NextResponse.json({ error: "platforms[] required" }, { status: 400 });

  const ucs = await db.ucsMessage.findUnique({ where: { id: ucsMessageId } });
  if (!ucs) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  // Approve gate
  if (approveNow) {
    if (!canApprove(user.role)) {
      return NextResponse.json({ error: "Forbidden: only admin or approver can approve" }, { status: 403 });
    }
    if (ucs.status !== "approved") {
      await db.ucsMessage.update({
        where: { id: ucsMessageId },
        data: { status: "approved" },
      });
    }
  } else if (ucs.status !== "approved") {
    return NextResponse.json(
      { error: "Campaign must be approved before publishing. Pass approveNow:true to approve and publish." },
      { status: 422 }
    );
  }

  const brandMode = ucs.brandMode;
  const jobStatus = scheduledFor ? "scheduled" : "queued";
  const scheduledAt = scheduledFor ? new Date(scheduledFor) : null;

  const jobs = [];

  for (const platform of platforms) {
    // Find the channel connection for this brand + platform
    const connection = await db.channelConnection.findUnique({
      where: { brandMode_platform: { brandMode, platform } },
    });

    if (!connection) {
      return NextResponse.json(
        { error: `No ${platform} connection found for brand ${brandMode}. Connect it in Settings → Channels.` },
        { status: 422 }
      );
    }

    // Brand isolation check (defense-in-depth: already guaranteed by unique index)
    if (connection.brandMode !== brandMode) {
      return NextResponse.json({ error: "Brand mismatch" }, { status: 422 });
    }

    const job = await db.ucsPublishJob.create({
      data: {
        brandMode,
        ucsMessageId,
        platform,
        connectionId: connection.id,
        scheduledFor: scheduledAt,
        status: jobStatus,
      },
    });

    jobs.push(job);
  }

  return NextResponse.json({ jobs }, { status: 201 });
}
