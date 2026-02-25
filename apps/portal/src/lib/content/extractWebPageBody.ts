/**
 * Extract the publishable HTML/markdown body from a web_page artifact's
 * raw content string, which may be:
 *
 *  - Plain HTML or markdown (the most common case after direct editing).
 *  - A JSON object with a top-level `html` or `body` field.
 *  - A JSON object with a `pages` array whose items have `body_html` or
 *    `body_markdown` fields — the format produced by several LLM agents.
 *
 * The function never throws; on any unexpected input it returns
 * `detected: "unknown"` with a descriptive warning.
 */

import { normalizeEscapes } from "./normalizeEscapes";

// ── Public types ──────────────────────────────────────────────────────────────

export type DetectedFormat =
  | "raw_html"
  | "json_body_html"
  | "json_body_markdown"
  | "unknown";

export interface ExtractResult {
  /** The extracted body ready for publishing (HTML or markdown string). */
  body: string;
  /** How the body was obtained — useful for logging and downstream decisions. */
  detected: DetectedFormat;
  /** Non-empty when the caller should know something went wrong or unexpected. */
  warnings?: string[];
}

// ── Entry point ───────────────────────────────────────────────────────────────

/**
 * Extract the publishable body from a raw artifact content string.
 *
 * @param input       The raw `artifact.content` string as stored in the DB.
 * @param opts.selectedSlug  The slug of the page the user selected in the UI
 *                    (`artifact.target.slug`).  Used to pick the right entry
 *                    from a `pages[]` array when the JSON contains multiple
 *                    pages.
 */
export function extractWebPageBody(
  input: string,
  opts: { selectedSlug?: string }
): ExtractResult {
  const trimmed = input.trim();

  // ── JSON path ─────────────────────────────────────────────────────────────
  if (trimmed.startsWith("{")) {
    let parsed: Record<string, unknown> | undefined;
    try {
      parsed = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      // Not valid JSON — fall through to raw HTML treatment below.
    }

    if (parsed) {
      // ── pages[] array format (e.g. from LLM agent output) ──────────────
      if (Array.isArray(parsed.pages)) {
        const pages = parsed.pages as Array<Record<string, unknown>>;
        const page = selectPage(pages, opts.selectedSlug);

        if (!page) {
          const slugList = pages
            .map((p) => String(p.slug ?? "(no slug)"))
            .join(", ");
          return {
            body: "",
            detected: "unknown",
            warnings: [
              opts.selectedSlug
                ? `No page matched slug "${opts.selectedSlug}" in JSON pages[]. ` +
                  `Available: ${slugList}`
                : `JSON contains ${pages.length} pages but no slug was selected. ` +
                  `Available: ${slugList}`,
            ],
          };
        }

        if (typeof page.body_html === "string") {
          return {
            body: normalizeEscapes(page.body_html),
            detected: "json_body_html",
          };
        }

        if (typeof page.body_markdown === "string") {
          // Return markdown as-is; wpElementorStaging's ensureHtml() converts it.
          return { body: page.body_markdown, detected: "json_body_markdown" };
        }

        // Page found but no recognised body field — fall through.
      }

      // ── Direct html / body fields ────────────────────────────────────────
      if (typeof parsed.html === "string") {
        return {
          body: normalizeEscapes(parsed.html),
          detected: "json_body_html",
        };
      }

      if (typeof parsed.body === "string") {
        return {
          body: normalizeEscapes(parsed.body),
          detected: "raw_html",
        };
      }

      // JSON parsed but no recognised field — fall through to raw treatment.
    }
  }

  // ── Raw HTML / markdown path ──────────────────────────────────────────────
  return { body: normalizeEscapes(trimmed), detected: "raw_html" };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function selectPage(
  pages: Array<Record<string, unknown>>,
  selectedSlug?: string
): Record<string, unknown> | undefined {
  if (selectedSlug) {
    return pages.find((p) => p.slug === selectedSlug);
  }
  // No slug specified: use the only page if there is exactly one.
  return pages.length === 1 ? pages[0] : undefined;
}
