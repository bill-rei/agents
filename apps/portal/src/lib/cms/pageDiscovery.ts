/**
 * CMS Page Discovery abstraction.
 *
 * Providers: "wordpress" (implemented), "squarespace" (stub — not yet).
 * Add new providers by creating providers/<name>.ts and adding a case below.
 */

import { listWordpressPages } from "./providers/wordpress";
import { listSquarespacePages } from "./providers/squarespace";

// ── Public types ──────────────────────────────────────────────────────────────

export type CmsProvider = "wordpress" | "squarespace";

export interface CmsPage {
  /** Numeric WordPress page ID, or provider-specific string ID. */
  id: number | string;
  title: string;
  slug: string;
  url?: string;
  /** Page status on the CMS (e.g. "draft", "publish", "private"). */
  status?: string;
}

export interface TargetSiteConfig {
  provider: CmsProvider;
  baseUrl: string;
  /** HTTP Basic Auth username (WordPress application password user). */
  username?: string;
  /** HTTP Basic Auth password (WordPress application password). */
  appPassword?: string;
}

// ── Entry point ───────────────────────────────────────────────────────────────

/**
 * List all pages for a given publishing target.
 * Dispatches to the appropriate provider implementation.
 */
export async function listPages(target: TargetSiteConfig): Promise<CmsPage[]> {
  switch (target.provider) {
    case "wordpress":
      return listWordpressPages(target);
    case "squarespace":
      return listSquarespacePages();
    default: {
      const _exhaustive: never = target.provider;
      throw new Error(`Unknown CMS provider: "${_exhaustive}"`);
    }
  }
}

// ── Client-side filtering helper (also exported for tests) ───────────────────

/**
 * Filter a page list by a search query.
 * Matches title OR slug, case-insensitively.
 */
export function filterPages(pages: CmsPage[], query: string): CmsPage[] {
  if (!query.trim()) return pages;
  const q = query.toLowerCase();
  return pages.filter(
    (p) =>
      p.title.toLowerCase().includes(q) ||
      p.slug.toLowerCase().includes(q)
  );
}
