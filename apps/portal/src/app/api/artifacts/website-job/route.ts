import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { parseRendererOutput, validateSlugUniqueness } from "@/lib/wp/websiteJob";
import type { WebJobMetadata } from "@/lib/wp/websiteJob";

/**
 * POST /api/artifacts/website-job
 *
 * Create a new multi-page website update job from web-renderer output.
 *
 * Body:
 *   runId         string   required
 *   brand         string   "llif" | "bestlife"
 *   siteKey       string   e.g. "llif-staging"
 *   rendererOutput string  raw JSON from web-renderer agent
 *   title?        string   optional job title
 */
export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { runId, brand, siteKey, rendererOutput, title } = body;

  if (!runId || !brand || !siteKey || !rendererOutput) {
    return NextResponse.json(
      { error: "runId, brand, siteKey, and rendererOutput are required" },
      { status: 400 }
    );
  }

  // Verify run exists
  const run = await db.run.findUnique({ where: { id: runId } });
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  // Parse renderer output into normalized pages
  const pages = parseRendererOutput(rendererOutput);
  if (pages.length === 0) {
    return NextResponse.json(
      { error: "Could not parse any pages from rendererOutput. Check the format." },
      { status: 400 }
    );
  }

  // Validate slug uniqueness
  const slugErrors = validateSlugUniqueness(pages);
  if (slugErrors.length > 0) {
    return NextResponse.json({ error: slugErrors.join(" ") }, { status: 400 });
  }

  const metadata: WebJobMetadata = {
    brand,
    siteKey,
    jobStatus: "DRAFT",
    requireAllApproved: false,
    pages,
  };

  const artifact = await db.artifact.create({
    data: {
      runId,
      type: "web_site_update",
      title: title || `Website Update — ${new Date().toLocaleDateString()}`,
      content: rendererOutput,
      status: "draft",
      target: { siteKey, brand },
      metadata: metadata as object,
    },
  });

  void user; // audit trail via createdByUserId not on artifact model directly
  return NextResponse.json(artifact, { status: 201 });
}
