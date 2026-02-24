import type { Brand } from "@/lib/designContract/schema";

// ── Credentials ──

export interface WpCredentials {
  baseUrl: string;
  username: string;
  appPassword: string;
}

export function getWpCredentials(brand: Brand): WpCredentials {
  if (brand === "llif") {
    const baseUrl = process.env.LLIF_WP_BASE_URL;
    const username = process.env.LLIF_WP_USERNAME;
    const appPassword = process.env.LLIF_WP_APP_PASSWORD;
    if (!baseUrl || !username || !appPassword) {
      throw new Error(
        "Missing LLIF WordPress credentials. " +
        "Expected env vars: LLIF_WP_BASE_URL, LLIF_WP_USERNAME, LLIF_WP_APP_PASSWORD"
      );
    }
    return { baseUrl: baseUrl.replace(/\/$/, ""), username, appPassword };
  }

  if (brand === "bestlife") {
    const baseUrl = process.env.BLA_WP_BASE_URL;
    const username = process.env.BLA_WP_USERNAME;
    const appPassword = process.env.BLA_WP_APP_PASSWORD;
    if (!baseUrl || !username || !appPassword) {
      throw new Error(
        "Missing BestLife WordPress credentials. " +
        "Expected env vars: BLA_WP_BASE_URL, BLA_WP_USERNAME, BLA_WP_APP_PASSWORD"
      );
    }
    return { baseUrl: baseUrl.replace(/\/$/, ""), username, appPassword };
  }

  throw new Error(`Unknown brand: "${brand}"`);
}

// ── Auth ──

export function basicAuthHeader(username: string, appPassword: string): string {
  const token = Buffer.from(`${username}:${appPassword}`).toString("base64");
  return `Basic ${token}`;
}

// ── Page CRUD ──

export interface WpPageResult {
  id: number;
  link: string;
  slug: string;
  status: string;
}

export async function getPageIdBySlug(
  baseUrl: string,
  auth: string,
  slug: string
): Promise<number | null> {
  // status=any ensures draft/private/pending pages are included —
  // staging sites typically leave pages as drafts.
  const url = `${baseUrl}/wp-json/wp/v2/pages?slug=${encodeURIComponent(slug)}&status=any&per_page=1`;
  const res = await fetch(url, {
    headers: { Authorization: auth, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`WP API error looking up slug "${slug}": ${res.status}`);
  }
  const pages = await res.json();
  return pages.length > 0 ? pages[0].id : null;
}

export async function createPage(
  baseUrl: string,
  auth: string,
  payload: {
    title: string;
    slug: string;
    status?: string;
    content?: string;
    meta?: Record<string, unknown>;
    acf?: Record<string, unknown>;
  }
): Promise<WpPageResult> {
  const res = await fetch(`${baseUrl}/wp-json/wp/v2/pages`, {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      title: payload.title,
      slug: payload.slug,
      status: payload.status || "draft",
      ...(payload.content ? { content: payload.content } : {}),
      ...(payload.meta ? { meta: payload.meta } : {}),
      ...(payload.acf ? { acf: payload.acf } : {}),
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    const msg = data.message || JSON.stringify(data);
    throw new Error(`WP create page failed (${res.status}): ${msg}`);
  }
  return { id: data.id, link: data.link, slug: data.slug, status: data.status };
}

export async function updatePage(
  baseUrl: string,
  auth: string,
  pageId: number,
  patch: Record<string, unknown>
): Promise<WpPageResult> {
  const res = await fetch(`${baseUrl}/wp-json/wp/v2/pages/${pageId}`, {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(patch),
  });

  const data = await res.json();
  if (!res.ok) {
    const msg = data.message || JSON.stringify(data);
    throw new Error(`WP update page failed (${res.status}): ${msg}`);
  }
  return { id: data.id, link: data.link, slug: data.slug, status: data.status };
}

/**
 * Check if ACF REST API is available on the WP site.
 * Attempts a HEAD request to the ACF fields endpoint.
 */
export async function checkAcfAvailable(baseUrl: string, auth: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/wp-json/acf/v3/pages?per_page=1`, {
      method: "HEAD",
      headers: { Authorization: auth },
    });
    return res.ok;
  } catch {
    return false;
  }
}
