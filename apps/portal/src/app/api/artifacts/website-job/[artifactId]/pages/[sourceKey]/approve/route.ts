import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { computeJobStatus } from "@/lib/wp/websiteJob";
import type { WebJobMetadata, ApprovalStatus } from "@/lib/wp/websiteJob";

type Params = { params: Promise<{ artifactId: string; sourceKey: string }> };

const VALID_DECISIONS: ApprovalStatus[] = ["approved", "rejected", "needs_changes"];

/**
 * POST /api/artifacts/website-job/[artifactId]/pages/[sourceKey]/approve
 *
 * Body: { decision: "approved" | "rejected" | "needs_changes", notes?: string }
 *
 * Records approval decision for a single page, then recomputes overall job status.
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { artifactId, sourceKey } = await params;
  const artifact = await db.artifact.findUnique({ where: { id: artifactId } });

  if (!artifact || artifact.type !== "web_site_update") {
    return NextResponse.json({ error: "Website job not found" }, { status: 404 });
  }

  const body = await req.json();
  const { decision, notes } = body;

  if (!VALID_DECISIONS.includes(decision)) {
    return NextResponse.json(
      { error: `decision must be one of: ${VALID_DECISIONS.join(", ")}` },
      { status: 400 }
    );
  }

  const meta = artifact.metadata as unknown as WebJobMetadata;
  const page = meta.pages.find((p) => p.source_key === sourceKey);

  if (!page) {
    return NextResponse.json(
      { error: `Page "${sourceKey}" not found in this job` },
      { status: 404 }
    );
  }

  // Apply decision
  page.approvalStatus = decision as ApprovalStatus;
  page.approvalNotes = notes || null;

  // Recompute overall job status
  meta.jobStatus = computeJobStatus(meta.pages, meta.jobStatus);

  // Sync artifact.status
  const artifactStatus =
    meta.jobStatus === "APPROVED" ? "approved" : "review";

  await db.artifact.update({
    where: { id: artifactId },
    data: {
      metadata: meta as object,
      status: artifactStatus,
    },
  });

  return NextResponse.json({ page, jobStatus: meta.jobStatus });
}
