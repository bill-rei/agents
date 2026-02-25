import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import type { WebJobMetadata, RefeedPayload } from "@/lib/wp/websiteJob";

type Params = { params: Promise<{ artifactId: string }> };

/**
 * POST /api/artifacts/website-job/[artifactId]/request-changes
 *
 * Builds a structured "refeed payload" that the user can paste into the
 * Editor or Web Renderer agent input to request revisions.
 *
 * Body:
 *   feedback   string   Required. Overall feedback or page-specific notes.
 *   pageKey?   string   If set, scopes feedback to a single page by source_key.
 */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { artifactId } = await params;
  const artifact = await db.artifact.findUnique({
    where: { id: artifactId },
    include: { run: true },
  });

  if (!artifact || artifact.type !== "web_site_update") {
    return NextResponse.json({ error: "Website job not found" }, { status: 404 });
  }

  const body = await req.json();
  const { feedback, pageKey } = body;

  if (!feedback || typeof feedback !== "string") {
    return NextResponse.json({ error: "feedback is required" }, { status: 400 });
  }

  const meta = artifact.metadata as unknown as WebJobMetadata;

  // Filter to single page or all pages
  const targetPages = pageKey
    ? meta.pages.filter((p) => p.source_key === pageKey)
    : meta.pages;

  if (pageKey && targetPages.length === 0) {
    return NextResponse.json(
      { error: `Page "${pageKey}" not found in this job` },
      { status: 404 }
    );
  }

  const refeedPayload: RefeedPayload = {
    run_id: artifact.runId,
    brand: meta.brand,
    agent_suggestion: "web-renderer",
    pages: targetPages.map((p) => ({
      source_key: p.source_key,
      slug: p.targetSlug,
      current_html: p.body_html || p.body_markdown || "",
      feedback,
    })),
    global_feedback: feedback,
  };

  // Persist the payload in metadata for traceability
  meta.feedbackPayload = refeedPayload;

  await db.artifact.update({
    where: { id: artifactId },
    data: { metadata: meta as object },
  });

  return NextResponse.json({ refeedPayload });
}
