import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { validateSlugUniqueness } from "@/lib/wp/websiteJob";
import type { WebJobMetadata } from "@/lib/wp/websiteJob";

type Params = { params: Promise<{ artifactId: string }> };

/**
 * GET /api/artifacts/website-job/[artifactId]
 * Returns full artifact including metadata (job state).
 */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { artifactId } = await params;
  const artifact = await db.artifact.findUnique({
    where: { id: artifactId },
    include: { publishLogs: { orderBy: { createdAt: "desc" }, take: 5 } },
  });

  if (!artifact || artifact.type !== "web_site_update") {
    return NextResponse.json({ error: "Website job not found" }, { status: 404 });
  }

  return NextResponse.json(artifact);
}

/**
 * PATCH /api/artifacts/website-job/[artifactId]
 *
 * Update slug mapping and/or job-level settings.
 *
 * Body:
 *   slugOverrides?       Record<source_key, targetSlug>
 *   siteKey?             string
 *   requireAllApproved?  boolean
 *   title?               string
 */
export async function PATCH(req: NextRequest, { params }: Params) {
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

  const body = await req.json();
  const { slugOverrides, siteKey, requireAllApproved, title } = body;

  const meta = artifact.metadata as unknown as WebJobMetadata;

  // Apply slug overrides
  if (slugOverrides && typeof slugOverrides === "object") {
    meta.pages = meta.pages.map((p) =>
      Object.prototype.hasOwnProperty.call(slugOverrides, p.source_key)
        ? { ...p, targetSlug: slugOverrides[p.source_key] }
        : p
    );
  }

  // Validate uniqueness after overrides
  const slugErrors = validateSlugUniqueness(meta.pages);
  if (slugErrors.length > 0) {
    return NextResponse.json({ error: slugErrors.join(" ") }, { status: 400 });
  }

  if (siteKey) {
    meta.siteKey = siteKey;
    (artifact.target as Record<string, string>).siteKey = siteKey;
  }
  if (typeof requireAllApproved === "boolean") {
    meta.requireAllApproved = requireAllApproved;
  }

  const updated = await db.artifact.update({
    where: { id: artifactId },
    data: {
      metadata: meta as object,
      ...(title ? { title } : {}),
      ...(siteKey ? { target: { ...(artifact.target as object), siteKey } } : {}),
    },
  });

  return NextResponse.json(updated);
}
