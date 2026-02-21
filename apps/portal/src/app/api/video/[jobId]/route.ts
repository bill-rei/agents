/**
 * GET /api/video/[jobId]
 *
 * Returns the status of a video generation job plus any completed VideoAsset rows.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { jobId } = params;

  const job = await db.agentJob.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      type: true,
      status: true,
      input: true,
      output: true,
      error: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!job || job.type !== "video_generate") {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  // Load associated VideoAsset rows
  const inputData = job.input as { artifactId?: string };
  const videoAssets = inputData.artifactId
    ? await db.videoAsset.findMany({
        where: { agentJobId: jobId },
        select: {
          id: true,
          variantId: true,
          aspectRatio: true,
          durationSeconds: true,
          storagePath: true,
          wpUrl: true,
          wpMediaId: true,
          wpSite: true,
          brand: true,
          meta: true,
          createdAt: true,
        },
        orderBy: { createdAt: "asc" },
      })
    : [];

  return NextResponse.json({
    jobId: job.id,
    status: job.status,
    error: job.error ?? null,
    input: job.input,
    output: job.output,
    videoAssets,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  });
}
