import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { getWpCredentials } from "@/lib/wp/wpClient";
import { validatePageSlugs } from "@/lib/wp/websiteJob";
import type { WebJobMetadata } from "@/lib/wp/websiteJob";
import type { Brand } from "@/lib/designContract/schema";

type Params = { params: Promise<{ artifactId: string }> };

/**
 * POST /api/artifacts/website-job/[artifactId]/validate-slugs
 *
 * For each page in the job, look up the targetSlug in WordPress staging.
 * Stores wpPageId + wpPageExists on each page. Advances jobStatus to IN_REVIEW.
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

  let creds;
  try {
    creds = getWpCredentials(meta.brand as Brand);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 }
    );
  }

  const results = await validatePageSlugs(
    meta.pages.map((p) => ({ source_key: p.source_key, targetSlug: p.targetSlug })),
    creds
  );

  // Update page metadata with WP lookup results
  const resultMap = new Map(results.map((r) => [r.source_key, r]));
  meta.pages = meta.pages.map((p) => {
    const r = resultMap.get(p.source_key);
    if (!r) return p;
    return { ...p, wpPageId: r.wpPageId, wpPageExists: r.exists };
  });

  if (meta.jobStatus === "DRAFT") {
    meta.jobStatus = "IN_REVIEW";
  }

  await db.artifact.update({
    where: { id: artifactId },
    data: { metadata: meta as object },
  });

  return NextResponse.json({ pages: results });
}
