/**
 * Robust parser for Web Renderer agent output.
 *
 * Handles three input shapes:
 *  1. "wrapped"    — { artifact_type:"web_page", content:{ html:"json\n{...pages...}" } }
 *                    (the Agent Output Contract wrapper around a multi-page JSON string)
 *  2. "direct"     — { brand, content_format, pages:[...] } or { pages:[...] }
 *  3. "raw_string" — bare HTML / markdown string (single-page fallback)
 *
 * For (1) the content.html may be prefixed with "json\n" or wrapped in ```json...```
 * code fences (an LLM habit). The helper strips those, then extracts pages[].
 */

import { normalizeEscapes } from "@/lib/content/normalizeEscapes";

// ── Types ────────────────────────────────────────────────────────────────────

export interface NormalizedPage {
  /** Stable slug — from renderer slug field, or slugified from title. */
  slug: string;
  title: string;
  body_html: string | null;
  body_markdown: string | null;
  meta_title?: string;
  meta_description?: string;
}

export interface ParseSource {
  kind: "wrapped" | "direct" | "raw_string";
  /** True when content.html contained an embedded JSON string that was extracted. */
  embedded_detected: boolean;
}

export interface NormalizedWebsiteArtifact {
  brand: string;
  content_format: string;
  pages: NormalizedPage[];
  source: ParseSource;
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "page"
  );
}

/**
 * Strip leading ``` or ```json fences and the closing ```.
 * Returns the stripped string (trimmed).
 */
function stripCodeFences(s: string): string {
  return s
    .replace(/^```(?:json)?\s*\r?\n/, "")
    .replace(/\r?\n?```\s*$/, "")
    .trim();
}

/**
 * Strip "json\n" or "json " prefix that LLMs sometimes emit before JSON blobs.
 */
function stripJsonPrefix(s: string): string {
  return s.replace(/^json[ \t]*\r?\n/, "").trim();
}

/**
 * Coerce a raw renderer pages array into NormalizedPage[].
 * Each element must have at minimum a title or slug.
 */
function normalizePages(raw: Array<Record<string, unknown>>): NormalizedPage[] {
  return raw.map((p, i) => {
    const rawSlug = typeof p.slug === "string" ? p.slug.trim() : "";
    const rawTitle =
      typeof p.title === "string" ? p.title.trim() : `Page ${i + 1}`;
    const slug = rawSlug || slugify(rawTitle);
    const title = rawTitle || slug;
    const body_html =
      typeof p.body_html === "string" ? normalizeEscapes(p.body_html) : null;
    const body_markdown =
      typeof p.body_markdown === "string"
        ? normalizeEscapes(p.body_markdown)
        : null;
    const meta_title =
      typeof p.meta_title === "string" ? p.meta_title : undefined;
    const meta_description =
      typeof p.meta_description === "string" ? p.meta_description : undefined;
    return { slug, title, body_html, body_markdown, meta_title, meta_description };
  });
}

/**
 * Try to extract embedded pages from a string that may contain "json\n{...}"
 * or a code-fenced JSON block. Returns NormalizedPage[] on success or null.
 */
function tryExtractEmbeddedPages(
  htmlField: string
): { pages: NormalizedPage[]; brand: string; content_format: string } | null {
  let s = htmlField.trim();

  // Strip BOM
  s = s.replace(/^\uFEFF/, "");

  // Strip code fences
  if (s.startsWith("```")) {
    s = stripCodeFences(s);
  }

  // Strip "json\n" or "json " prefix
  s = stripJsonPrefix(s);

  if (!s.startsWith("{") && !s.startsWith("[")) return null;

  let inner: unknown;
  try {
    inner = JSON.parse(s);
  } catch {
    return null;
  }

  if (!inner || typeof inner !== "object" || Array.isArray(inner)) return null;

  const obj = inner as Record<string, unknown>;
  if (!Array.isArray(obj.pages) || obj.pages.length === 0) return null;

  return {
    brand: typeof obj.brand === "string" ? obj.brand : "unknown",
    content_format:
      typeof obj.content_format === "string" ? obj.content_format : "html",
    pages: normalizePages(obj.pages as Array<Record<string, unknown>>),
  };
}

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Parse any Web Renderer output string (or already-parsed object) into a
 * normalised artifact with a pages[] array.
 *
 * Throws a descriptive Error on failure so the caller can surface it to the UI.
 */
export function normalizeWebRendererOutput(
  input: unknown
): NormalizedWebsiteArtifact {
  // Accept pre-parsed objects by re-serialising them
  let raw: string;
  if (typeof input === "string") {
    raw = input;
  } else if (input !== null && typeof input === "object") {
    raw = JSON.stringify(input);
  } else {
    throw new Error("Invalid input: expected a string or object.");
  }

  // Strip BOM, trim
  raw = raw.replace(/^\uFEFF/, "").trim();
  if (!raw) throw new Error("Empty input — nothing to parse.");

  // Strip outer code fences if present
  let stripped = raw;
  if (stripped.startsWith("```")) {
    stripped = stripCodeFences(stripped);
  }

  // Strip leading "json\n" prefix
  stripped = stripJsonPrefix(stripped);

  // ── Attempt JSON parse ───────────────────────────────────────────────────

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    // Not JSON at all — treat the raw string as single-page HTML
    return {
      brand: "unknown",
      content_format: "html",
      pages: [
        {
          slug: "page",
          title: "Page",
          body_html: normalizeEscapes(stripped),
          body_markdown: null,
        },
      ],
      source: { kind: "raw_string", embedded_detected: false },
    };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      "Expected a JSON object at the top level but received a different type."
    );
  }

  const obj = parsed as Record<string, unknown>;

  // ── Case 1: Wrapped web_page artifact ────────────────────────────────────
  //   { artifact_type: "web_page", content: { html: "json\n{...pages...}" } }

  if (
    obj.artifact_type === "web_page" &&
    typeof obj.content === "object" &&
    obj.content !== null
  ) {
    const content = obj.content as Record<string, unknown>;
    const htmlField = typeof content.html === "string" ? content.html : null;

    if (htmlField) {
      // Try to extract embedded pages[] from the html field
      const extracted = tryExtractEmbeddedPages(htmlField);

      if (extracted) {
        return {
          brand: extracted.brand,
          content_format: extracted.content_format,
          pages: extracted.pages,
          source: { kind: "wrapped", embedded_detected: true },
        };
      }

      // content.html is plain HTML (no embedded JSON) — single page
      const title =
        typeof content.title === "string" ? content.title.trim() : "Page";
      return {
        brand: "unknown",
        content_format: "html",
        pages: [
          {
            slug: slugify(title),
            title,
            body_html: normalizeEscapes(htmlField),
            body_markdown: null,
          },
        ],
        source: { kind: "wrapped", embedded_detected: false },
      };
    }

    throw new Error(
      "Wrapped web_page artifact detected but content.html is missing or empty."
    );
  }

  // ── Case 2: Direct multi-page format ─────────────────────────────────────
  //   { brand?, content_format?, pages: [...] }

  if (Array.isArray(obj.pages) && obj.pages.length > 0) {
    return {
      brand: typeof obj.brand === "string" ? obj.brand : "unknown",
      content_format:
        typeof obj.content_format === "string" ? obj.content_format : "html",
      pages: normalizePages(obj.pages as Array<Record<string, unknown>>),
      source: { kind: "direct", embedded_detected: false },
    };
  }

  // ── Case 3: Single-page { html } or { body } format ──────────────────────

  const htmlVal =
    typeof obj.html === "string"
      ? obj.html
      : typeof obj.body === "string"
      ? obj.body
      : null;

  if (htmlVal) {
    return {
      brand: "unknown",
      content_format: "html",
      pages: [
        {
          slug: "page",
          title: "Page",
          body_html: normalizeEscapes(htmlVal),
          body_markdown: null,
        },
      ],
      source: { kind: "direct", embedded_detected: false },
    };
  }

  // ── Case 4: { content: { title, html } } single-page format ──────────────
  //   (web-renderer single-page output without artifact_type wrapper)

  if (typeof obj.content === "object" && obj.content !== null) {
    const content = obj.content as Record<string, unknown>;
    const title =
      typeof content.title === "string" ? content.title.trim() : "Page";
    const contentHtml =
      typeof content.html === "string" ? content.html : null;
    if (contentHtml) {
      return {
        brand: "unknown",
        content_format: "html",
        pages: [
          {
            slug: slugify(title),
            title,
            body_html: normalizeEscapes(contentHtml),
            body_markdown: null,
          },
        ],
        source: { kind: "direct", embedded_detected: false },
      };
    }
  }

  // ── Nothing worked ────────────────────────────────────────────────────────

  throw new Error(
    "Could not extract pages from the provided output. " +
      "Expected one of: { pages: [...] }, a wrapped web_page artifact, " +
      "{ html: '...' }, or raw HTML string."
  );
}
