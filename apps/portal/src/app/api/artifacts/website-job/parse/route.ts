import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { normalizeWebRendererOutput } from "@/lib/wp/normalizeRendererOutput";
import { validateSlugUniqueness } from "@/lib/wp/websiteJob";
import type { WebJobPage } from "@/lib/wp/websiteJob";

/**
 * POST /api/artifacts/website-job/parse
 *
 * Server-side parse preview — does NOT create an artifact.
 * Returns the list of pages that would be created so the UI can show a
 * preview before the user commits to "Create Job".
 *
 * Body: { rendererOutput: string }
 *
 * Response:
 *   200 { brand, content_format, pages, source, duplicates }
 *   400 { error }
 */
export async function POST(req: NextRequest) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const { rendererOutput } = body as { rendererOutput?: string };

  if (!rendererOutput || typeof rendererOutput !== "string" || !rendererOutput.trim()) {
    return NextResponse.json({ error: "rendererOutput is required" }, { status: 400 });
  }

  let result;
  try {
    result = normalizeWebRendererOutput(rendererOutput);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }

  // Build lightweight page descriptors for the preview (no full body)
  const pageDescriptors = result.pages.map((p) => ({
    slug: p.slug,
    title: p.title,
    meta_title: p.meta_title ?? null,
    meta_description: p.meta_description ?? null,
    body_length: (p.body_html ?? p.body_markdown ?? "").length,
    has_html: p.body_html !== null,
    has_markdown: p.body_markdown !== null,
  }));

  // Check for duplicate slugs using the same WebJobPage shape
  const fakePages: WebJobPage[] = result.pages.map((p) => ({
    source_key: p.slug,
    title: p.title,
    targetSlug: p.slug,
    body_html: p.body_html,
    body_markdown: p.body_markdown,
    approvalStatus: "pending",
    approvalNotes: null,
    wpPageId: null,
    wpPageExists: null,
    publishStatus: null,
    publishResult: null,
  }));
  const duplicates = validateSlugUniqueness(fakePages);

  return NextResponse.json({
    brand: result.brand,
    content_format: result.content_format,
    pages: pageDescriptors,
    source: result.source,
    duplicates,
  });
}
