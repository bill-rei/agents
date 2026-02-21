import { validateDesignContract } from "@/lib/designContract/validate";
import type { DesignContract } from "@/lib/designContract/schema";
import { getTemplateId } from "@/lib/templates/registry";
import {
  getWpCredentials,
  basicAuthHeader,
  getPageIdBySlug,
  createPage,
  updatePage,
  checkAcfAvailable,
} from "./wpClient";
import fs from "fs";
import path from "path";

// ── Logging ──

const LOG_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR, "..")
  : path.resolve(process.cwd(), "data");
const LOG_PATH = path.join(LOG_DIR, "design-locked-publish.jsonl");

function appendPublishLog(entry: Record<string, unknown>) {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), ...entry }) + "\n";
  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_PATH, line, "utf8");
  } catch {
    // Non-fatal — log to console as fallback
    console.error("[design-locked-publish] Failed to write log:", line);
  }
}

// ── Fallback HTML generator ──

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Build simple fallback HTML from structured data.
 * Only uses allowed tags: h1, h2, p, ul, li, strong, em.
 * No inline styles.
 */
export function buildFallbackHtml(data: DesignContract): string {
  const parts: string[] = [];

  // Hero
  parts.push(`<h1>${escapeHtml(data.hero.title)}</h1>`);
  if (data.hero.eyebrow) {
    parts.push(`<p><strong>${escapeHtml(data.hero.eyebrow)}</strong></p>`);
  }
  if (data.hero.subtitle) {
    parts.push(`<p><em>${escapeHtml(data.hero.subtitle)}</em></p>`);
  }

  // TL;DR
  parts.push(`<h2>TL;DR</h2>`);
  parts.push(`<p>${escapeHtml(data.tldr.summary)}</p>`);

  // Sections
  for (const section of data.sections) {
    parts.push(`<h2>${escapeHtml(section.heading)}</h2>`);
    parts.push(`<p>${escapeHtml(section.body)}</p>`);
    if (section.bullets && section.bullets.length > 0) {
      parts.push("<ul>");
      for (const bullet of section.bullets) {
        parts.push(`<li>${escapeHtml(bullet)}</li>`);
      }
      parts.push("</ul>");
    }
  }

  // Privacy block
  if (data.privacy_block?.enabled && data.privacy_block.text) {
    parts.push(`<h2>Privacy</h2>`);
    parts.push(`<p>${escapeHtml(data.privacy_block.text)}</p>`);
  }

  // CTA
  parts.push(`<h2>${escapeHtml(data.cta.headline)}</h2>`);
  parts.push(
    `<p><strong><a href="${escapeHtml(data.cta.button_url)}">${escapeHtml(data.cta.button_text)}</a></strong></p>`
  );

  return parts.join("\n");
}

// ── ACF field mapping ──

function buildAcfFields(data: DesignContract): Record<string, unknown> {
  return {
    hero_title: data.hero.title,
    hero_subtitle: data.hero.subtitle || "",
    hero_eyebrow: data.hero.eyebrow || "",
    tldr_summary: data.tldr.summary,
    sections: data.sections.map((s) => ({
      heading: s.heading,
      body: s.body,
      bullets: s.bullets?.join("\n") || "",
    })),
    privacy_enabled: data.privacy_block?.enabled ?? false,
    privacy_text: data.privacy_block?.text || "",
    cta_headline: data.cta.headline,
    cta_button_text: data.cta.button_text,
    cta_button_url: data.cta.button_url,
    version: data.meta.version,
    last_updated: data.meta.last_updated,
    campaign_type: data.meta.campaign_type,
    brand: data.meta.brand,
  };
}

/** Build flat meta fields (fallback when ACF is unavailable). */
function buildMetaFields(data: DesignContract): Record<string, unknown> {
  return {
    _design_contract_version: data.meta.version,
    _design_contract_brand: data.meta.brand,
    _design_contract_campaign_type: data.meta.campaign_type,
    _design_contract_last_updated: data.meta.last_updated,
    hero_title: data.hero.title,
    hero_subtitle: data.hero.subtitle || "",
    hero_eyebrow: data.hero.eyebrow || "",
    tldr_summary: data.tldr.summary,
    sections_json: JSON.stringify(data.sections),
    privacy_enabled: data.privacy_block?.enabled ? "1" : "0",
    privacy_text: data.privacy_block?.text || "",
    cta_headline: data.cta.headline,
    cta_button_text: data.cta.button_text,
    cta_button_url: data.cta.button_url,
  };
}

// ── Main publish function ──

export interface PublishDesignLockedInput {
  slug: string;
  title?: string;
  artifact: unknown;
  status?: "draft" | "publish";
  /** Extra WP meta fields merged alongside the design-contract meta (e.g. { llif_videos: "..." }). */
  additionalMeta?: Record<string, unknown>;
}

export interface PublishDesignLockedResult {
  ok: true;
  brand: string;
  campaign_type: string;
  pageId: number;
  url: string;
  usedAcf: boolean;
  templateId: number;
}

export async function publishDesignLockedPage(
  input: PublishDesignLockedInput
): Promise<PublishDesignLockedResult> {
  // 1. Validate the structured artifact
  const validation = validateDesignContract(input.artifact);
  if (!validation.ok || !validation.data) {
    throw new Error(
      `Design contract validation failed:\n  - ${validation.errors.join("\n  - ")}`
    );
  }

  const data = validation.data;
  const { brand, campaign_type } = data.meta;

  // 2. Get template ID
  const templateId = getTemplateId(brand, campaign_type);

  // 3. Get WP credentials for the brand
  const creds = getWpCredentials(brand);
  const auth = basicAuthHeader(creds.username, creds.appPassword);

  // 4. Check ACF availability
  const acfAvailable = await checkAcfAvailable(creds.baseUrl, auth);

  // 5. Find or create page by slug
  let pageId = await getPageIdBySlug(creds.baseUrl, auth, input.slug);
  const pageTitle = input.title || data.hero.title;
  const pageStatus = input.status || "draft";

  // Build Elementor template meta
  // NOTE: These meta keys work for most Elementor setups. If your theme
  // uses a different convention, adjust the keys here.
  const elementorMeta: Record<string, unknown> = {
    _elementor_template_type: "wp-page",
    _elementor_edit_mode: "builder",
    _wp_page_template: "elementor_canvas",
    _elementor_template_id: String(templateId),
    template_slug: `${brand}-${campaign_type}`,
  };

  const extraMeta = input.additionalMeta ?? {};

  if (pageId === null) {
    // Create new page
    const payload: Record<string, unknown> = {
      title: pageTitle,
      slug: input.slug,
      status: pageStatus,
      meta: { ...elementorMeta, ...extraMeta },
    };

    if (acfAvailable) {
      payload.acf = buildAcfFields(data);
    } else {
      payload.meta = { ...elementorMeta, ...buildMetaFields(data), ...extraMeta };
      payload.content = buildFallbackHtml(data);
    }

    const result = await createPage(creds.baseUrl, auth, payload as Parameters<typeof createPage>[2]);
    pageId = result.id;

    const logEntry = {
      brand,
      campaign_type,
      slug: input.slug,
      pageId,
      url: result.link,
      templateId,
      status: pageStatus,
      usedAcf: acfAvailable,
      action: "created",
    };
    appendPublishLog(logEntry);

    return {
      ok: true,
      brand,
      campaign_type,
      pageId,
      url: result.link,
      usedAcf: acfAvailable,
      templateId,
    };
  }

  // Update existing page
  const patch: Record<string, unknown> = {
    title: pageTitle,
    status: pageStatus,
    meta: { ...elementorMeta, ...extraMeta },
  };

  if (acfAvailable) {
    patch.acf = buildAcfFields(data);
  } else {
    patch.meta = { ...elementorMeta, ...buildMetaFields(data), ...extraMeta };
    patch.content = buildFallbackHtml(data);
  }

  const result = await updatePage(creds.baseUrl, auth, pageId, patch);

  const logEntry = {
    brand,
    campaign_type,
    slug: input.slug,
    pageId,
    url: result.link,
    templateId,
    status: pageStatus,
    usedAcf: acfAvailable,
    action: "updated",
  };
  appendPublishLog(logEntry);

  return {
    ok: true,
    brand,
    campaign_type,
    pageId,
    url: result.link,
    usedAcf: acfAvailable,
    templateId,
  };
}
