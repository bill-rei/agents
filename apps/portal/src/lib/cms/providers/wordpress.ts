/**
 * WordPress CMS page discovery provider.
 * Paginates through all pages using the WP REST API.
 */

import type { CmsPage, TargetSiteConfig } from "../pageDiscovery";

const PER_PAGE = 100;

export async function listWordpressPages(config: TargetSiteConfig): Promise<CmsPage[]> {
  const baseUrl = config.baseUrl.replace(/\/$/, "");

  const headers: Record<string, string> = { Accept: "application/json" };
  if (config.username && config.appPassword) {
    const token = Buffer.from(`${config.username}:${config.appPassword}`).toString("base64");
    headers.Authorization = `Basic ${token}`;
  }

  const all: CmsPage[] = [];
  let page = 1;

  while (true) {
    // status=any: include draft/pending/private pages (common on staging sites)
    const url =
      `${baseUrl}/wp-json/wp/v2/pages` +
      `?per_page=${PER_PAGE}&page=${page}&orderby=title&order=asc&status=any`;

    const res = await fetch(url, { headers, cache: "no-store" });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `WordPress API error fetching pages (HTTP ${res.status}): ${body.slice(0, 200)}`
      );
    }

    const rows: WpPageRow[] = await res.json();

    for (const r of rows) {
      all.push({
        id: r.id,
        title: stripHtml(r.title?.rendered ?? ""),
        slug: r.slug,
        url: r.link,
        status: r.status,
      });
    }

    // Stop when we've received a partial page (last page of results)
    if (rows.length < PER_PAGE) break;
    page++;
  }

  return all;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

interface WpPageRow {
  id: number;
  slug: string;
  link: string;
  status: string;
  title: { rendered: string };
}

/** Strip HTML tags and decode common HTML entities from WP title.rendered. */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}
