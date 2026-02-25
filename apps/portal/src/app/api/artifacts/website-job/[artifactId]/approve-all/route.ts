import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import type { WebJobMetadata } from "@/lib/wp/websiteJob";

type Params = { params: Promise<{ artifactId: string }> };

/**
 * POST /api/artifacts/website-job/[artifactId]/approve-all
 *
 * Sets all pages to approved and advances jobStatus to APPROVED.
 */
export async function POST(_req: NextRequest, { params }: Params) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { artifactId } = await params;
  const artifact = await db.artifact.findUnique({ where: { id: artifactId } });

  if (!artifact || artifact.type !== "web_site_update") {
    return NextResponse.json({ error: "Website job not found" }, { status: 404 });
  }

  const meta = artifact.metadata as unknown as WebJobMetadata;

  meta.pages = meta.pages.map((p) => ({
    ...p,
    approvalStatus: "approved" as const,
  }));
  meta.jobStatus = "APPROVED";

  await db.artifact.update({
    where: { id: artifactId },
    data: {
      metadata: meta as object,
      status: "approved",
    },
  });

  return NextResponse.json({ jobStatus: meta.jobStatus, pagesApproved: meta.pages.length });
}
