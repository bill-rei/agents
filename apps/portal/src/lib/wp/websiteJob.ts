/**
 * Domain logic for multi-page website update jobs.
 *
 * A "website job" is an Artifact with type="web_site_update" whose content
 * holds the raw web-renderer output and whose metadata holds all mutable
 * job state: page list, slug mapping, per-page approval, and publish results.
 */

import { normalizeEscapes } from "@/lib/content/normalizeEscapes";
import {
  getPageIdBySlug,
  updatePage,
  createPage,
  basicAuthHeader,
} from "@/lib/wp/wpClient";
import type { WpCredentials } from "@/lib/wp/wpClient";

// ── Public types ──────────────────────────────────────────────────────────────

export type ApprovalStatus = "pending" | "approved" | "rejected" | "needs_changes";
export type PublishStatus = "ok" | "failed";
export type JobStatus =
  | "DRAFT"
  | "IN_REVIEW"
  | "APPROVED"
  | "PUBLISHING"
  | "PUBLISHED"
  | "FAILED"
  | "PARTIAL_FAILED";

export interface WebJobPage {
  /** Stable identifier — renderer slug or generated from title. */
  source_key: string;
  title: string;
  /** User-editable target WordPress slug. Defaults to source_key. */
  targetSlug: string;
  body_html: string | null;
  body_markdown: string | null;
  // Approval
  approvalStatus: ApprovalStatus;
  approvalNotes: string | null;
  // WP existence (filled by validate-slugs)
  wpPageId: number | null;
  wpPageExists: boolean | null;
  // Publish result (filled after publish)
  publishStatus: PublishStatus | null;
  publishResult: PagePublishResult | null;
}

export interface WebJobMetadata {
  brand: string;
  siteKey: string;
  jobStatus: JobStatus;
  requireAllApproved: boolean;
  pages: WebJobPage[];
  feedbackPayload?: RefeedPayload | null;
}

export interface SlugValidationResult {
  source_key: string;
  targetSlug: string;
  exists: boolean;
  wpPageId: number | null;
}

export interface PagePublishResult {
  source_key: string;
  ok: boolean;
  wpPageId?: number;
  link?: string;
  status?: string;
  error?: string;
}

export interface RefeedPayload {
  run_id: string;
  brand: string;
  agent_suggestion: "web-renderer";
  pages: Array<{
    source_key: string;
    slug: string;
    current_html: string;
    feedback: string;
  }>;
  global_feedback: string;
}

// ── slug helpers ──────────────────────────────────────────────────────────────

/** Generate a URL-safe slug from a title. */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "page";
}

// ── Parsing ───────────────────────────────────────────────────────────────────

/**
 * Parse a raw web-renderer output string into a list of WebJobPage objects.
 *
 * Supported input formats:
 *  1. JSON with pages[] array (most common agent output)
 *  2. JSON with top-level html / body field  (single-page)
 *  3. Raw HTML / markdown                    (single-page fallback)
 */
export function parseRendererOutput(raw: string): WebJobPage[] {
  const trimmed = raw.trim();

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      // fall through to raw HTML
    }

    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>;

      // pages[] array format
      if (Array.isArray(obj.pages) && obj.pages.length > 0) {
        return (obj.pages as Array<Record<string, unknown>>).map((p, i) => {
          const rawSlug = typeof p.slug === "string" ? p.slug : "";
          const rawTitle = typeof p.title === "string" ? p.title : `Page ${i + 1}`;
          const sourceKey = rawSlug || slugify(rawTitle);
          const bodyHtml =
            typeof p.body_html === "string" ? normalizeEscapes(p.body_html) : null;
          const bodyMarkdown =
            typeof p.body_markdown === "string" ? normalizeEscapes(p.body_markdown) : null;
          return makePage(sourceKey, rawTitle, sourceKey, bodyHtml, bodyMarkdown);
        });
      }

      // { html } or { body } single-page format
      const html =
        typeof obj.html === "string"
          ? normalizeEscapes(obj.html)
          : typeof obj.body === "string"
          ? normalizeEscapes(obj.body)
          : null;

      // { content: { html, title } } format from web-renderer
      if (typeof obj.content === "object" && obj.content !== null) {
        const c = obj.content as Record<string, unknown>;
        const title =
          typeof c.title === "string" ? c.title : "Page";
        const pageHtml = typeof c.html === "string" ? normalizeEscapes(c.html) : html;
        if (pageHtml) {
          const key = slugify(title);
          return [makePage(key, title, key, pageHtml, null)];
        }
      }

      if (html) {
        return [makePage("page", "Page", "page", html, null)];
      }
    }
  }

  // Raw HTML / markdown fallback — single page
  const body = normalizeEscapes(trimmed);
  if (!body) return [];
  return [makePage("page", "Page", "page", body, null)];
}

function makePage(
  source_key: string,
  title: string,
  targetSlug: string,
  body_html: string | null,
  body_markdown: string | null
): WebJobPage {
  return {
    source_key,
    title,
    targetSlug,
    body_html,
    body_markdown,
    approvalStatus: "pending",
    approvalNotes: null,
    wpPageId: null,
    wpPageExists: null,
    publishStatus: null,
    publishResult: null,
  };
}

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Return an error message for each duplicate targetSlug within the page list.
 * Returns [] when all slugs are unique.
 */
export function validateSlugUniqueness(pages: WebJobPage[]): string[] {
  const seen = new Map<string, string>(); // slug → first source_key
  const errors: string[] = [];
  for (const p of pages) {
    const existing = seen.get(p.targetSlug);
    if (existing) {
      errors.push(
        `Duplicate target slug "${p.targetSlug}" used by "${existing}" and "${p.source_key}".`
      );
    } else {
      seen.set(p.targetSlug, p.source_key);
    }
  }
  return errors;
}

// ── WP slug validation ────────────────────────────────────────────────────────

/**
 * For each page, look up the target slug in WordPress.
 * Returns existence status and wpPageId (null = not found = will be created on publish).
 */
export async function validatePageSlugs(
  pages: Array<{ source_key: string; targetSlug: string }>,
  creds: WpCredentials
): Promise<SlugValidationResult[]> {
  const auth = basicAuthHeader(creds.username, creds.appPassword);
  const results: SlugValidationResult[] = [];

  for (const p of pages) {
    try {
      const wpPageId = await getPageIdBySlug(creds.baseUrl, auth, p.targetSlug);
      results.push({
        source_key: p.source_key,
        targetSlug: p.targetSlug,
        exists: wpPageId !== null,
        wpPageId,
      });
    } catch (err) {
      results.push({
        source_key: p.source_key,
        targetSlug: p.targetSlug,
        exists: false,
        wpPageId: null,
      });
      console.error(`[websiteJob] slug lookup error for "${p.targetSlug}":`, err);
    }
  }

  return results;
}

// ── Batch publish ─────────────────────────────────────────────────────────────

/**
 * Publish all pages sequentially to WordPress.
 * Pages with wpPageId=null will have a new page created.
 * Returns one result per page (success or failure — never throws).
 */
export async function publishWebsiteJobPages(
  pages: WebJobPage[],
  creds: WpCredentials
): Promise<PagePublishResult[]> {
  const auth = basicAuthHeader(creds.username, creds.appPassword);
  const results: PagePublishResult[] = [];

  for (const p of pages) {
    const content = p.body_html || p.body_markdown || "";
    try {
      if (p.wpPageId) {
        // Update existing page
        const wpResult = await updatePage(creds.baseUrl, auth, p.wpPageId, {
          title: p.title,
          content,
        });
        results.push({
          source_key: p.source_key,
          ok: true,
          wpPageId: wpResult.id,
          link: wpResult.link,
          status: wpResult.status,
        });
      } else {
        // Create new page (slug not found in WP)
        const wpResult = await createPage(creds.baseUrl, auth, {
          title: p.title,
          slug: p.targetSlug,
          content,
          status: "draft",
        });
        results.push({
          source_key: p.source_key,
          ok: true,
          wpPageId: wpResult.id,
          link: wpResult.link,
          status: wpResult.status,
        });
      }
    } catch (err) {
      results.push({
        source_key: p.source_key,
        ok: false,
        error: (err as Error).message,
      });
    }
  }

  return results;
}

// ── Job status computation ────────────────────────────────────────────────────

/** Recompute job-level status from per-page approval states. */
export function computeJobStatus(
  pages: WebJobPage[],
  current: JobStatus
): JobStatus {
  // Don't downgrade a publishing/published/failed status
  if (
    current === "PUBLISHING" ||
    current === "PUBLISHED" ||
    current === "FAILED" ||
    current === "PARTIAL_FAILED"
  ) {
    return current;
  }

  const allApproved = pages.every((p) => p.approvalStatus === "approved");
  if (allApproved) return "APPROVED";

  const anyNeedsChanges = pages.some((p) => p.approvalStatus === "needs_changes");
  if (anyNeedsChanges) return "IN_REVIEW";

  // Has at least one approval but not all
  const anyApproved = pages.some((p) => p.approvalStatus === "approved");
  if (anyApproved) return "IN_REVIEW";

  // Initial state or still pending
  return current === "DRAFT" ? "DRAFT" : "IN_REVIEW";
}

/** Compute job status after a publish batch. */
export function computePostPublishJobStatus(results: PagePublishResult[]): JobStatus {
  const allOk = results.every((r) => r.ok);
  const anyOk = results.some((r) => r.ok);
  if (allOk) return "PUBLISHED";
  if (anyOk) return "PARTIAL_FAILED";
  return "FAILED";
}
