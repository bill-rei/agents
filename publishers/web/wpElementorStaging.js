#!/usr/bin/env node
require("dotenv").config({ path: require("path").join(__dirname, "..", "..", ".env") });

const fs = require("fs");
const path = require("path");
const { validateArtifact } = require("../../marketing-artifacts");
const { ensureHtml } = require("../../lib/markdownToHtml");

const LOG_PATH = path.join(__dirname, "..", "..", "publish-log.jsonl");

// ── Helpers (ported from marketing-staging-sync/push-page.mjs) ──

function basicAuthHeader(username, appPassword) {
  const token = Buffer.from(`${username}:${appPassword}`).toString("base64");
  return `Basic ${token}`;
}

async function getPageIdBySlug(baseUrl, authHeader, slug) {
  const url = `${baseUrl}/wp-json/wp/v2/pages?slug=${encodeURIComponent(slug)}`;
  const res = await fetch(url, {
    headers: { Authorization: authHeader, Accept: "application/json" },
  });

  if (!res.ok) throw new Error(`WP API error looking up slug "${slug}": ${res.status}`);

  const pages = await res.json();
  if (!pages.length) throw new Error(`No page found with slug "${slug}"`);

  return pages[0].id;
}

// ── Site config resolution ──

function resolveSiteConfig(siteKey) {
  const prefix = `WP_${siteKey.toUpperCase().replace(/-/g, "_")}`;
  const url = process.env[`${prefix}_URL`];
  const user = process.env[`${prefix}_USER`];
  const pass = process.env[`${prefix}_APP_PASSWORD`];

  if (!url || !user || !pass) {
    throw new Error(
      `Missing env vars for site "${siteKey}". Expected: ${prefix}_URL, ${prefix}_USER, ${prefix}_APP_PASSWORD`
    );
  }

  const baseUrl = url.replace(/\/$/, "");

  // Safety: never touch production
  // Accept "staging" anywhere in URL, or "stg-" / "stg." as common prefixes
  const looksLikeStaging = /staging|stg[-.]/.test(baseUrl);
  if (!looksLikeStaging) {
    throw new Error(
      `Refusing to publish: URL for "${siteKey}" does not look like a staging site (${baseUrl}). ` +
      'Expected "staging", "stg-", or "stg." in the URL. This adapter only targets staging environments.'
    );
  }

  return { baseUrl, user, pass };
}

// ── Logging ──

function appendLog(entry) {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), ...entry }) + "\n";
  fs.appendFileSync(LOG_PATH, line, "utf8");
}

// ── Media validation (fail-fast, B) ──

function validateMediaBindings(artifact) {
  const mediaAssets = artifact.media_assets || [];
  const contentBlocks = artifact.content_blocks || [];

  const assetMap = new Map();
  for (const asset of mediaAssets) {
    assetMap.set(asset.asset_id, asset);
  }

  const errors = [];

  for (const block of contentBlocks) {
    if (!block.media_bindings) continue;
    for (const binding of block.media_bindings) {
      const asset = assetMap.get(binding.asset_id);
      if (!asset) {
        errors.push(`[media] binding references unknown asset_id="${binding.asset_id}"`);
        continue;
      }

      const missing = [];
      if (!asset.seo?.alt) missing.push("alt");
      if (!asset.seo?.filename_slug) missing.push("filename_slug");
      if (!asset.geo?.llm_description) missing.push("llm_description");

      if (missing.length) {
        errors.push(
          `[media] missing required fields for asset_id="${binding.asset_id}": ${missing.join("/")}`
        );
      }
    }
  }

  if (errors.length) {
    throw new Error(`Media validation failed:\n  - ${errors.join("\n  - ")}`);
  }
}

// ── WordPress Media Library helpers (C) ──

const MIME_MAP = {
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

const CONTENT_TYPE_EXT = {
  "image/webp": ".webp",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/svg+xml": ".svg",
};

async function wpUploadMediaBuffer(baseUrl, authHeader, buffer, filename, mimeType) {
  const res = await fetch(`${baseUrl}/wp-json/wp/v2/media`, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": mimeType,
      Accept: "application/json",
    },
    body: buffer,
  });

  const data = await res.json();
  if (!res.ok) {
    const msg = data.message || JSON.stringify(data);
    throw new Error(`WP media upload failed (${res.status}): ${msg}`);
  }
  return data;
}

async function wpUpdateMediaMeta(baseUrl, authHeader, mediaId, { alt, title, caption }) {
  const body = { alt_text: alt };
  if (title) body.title = title;
  if (caption) body.caption = caption;

  const res = await fetch(`${baseUrl}/wp-json/wp/v2/media/${mediaId}`, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) {
    const msg = data.message || JSON.stringify(data);
    throw new Error(`WP media meta update failed (${res.status}): ${msg}`);
  }
  return data;
}

async function getMediaById(baseUrl, authHeader, mediaId) {
  const res = await fetch(`${baseUrl}/wp-json/wp/v2/media/${mediaId}`, {
    headers: { Authorization: authHeader, Accept: "application/json" },
  });

  const data = await res.json();
  if (!res.ok) {
    const msg = data.message || JSON.stringify(data);
    throw new Error(`WP media fetch failed (${res.status}): ${msg}`);
  }
  return data;
}

function extFromContentType(contentType) {
  if (!contentType) return null;
  const base = contentType.split(";")[0].trim().toLowerCase();
  return CONTENT_TYPE_EXT[base] || null;
}

function extFromUrl(urlString) {
  try {
    const pathname = new URL(urlString).pathname;
    const ext = path.extname(pathname).toLowerCase();
    return MIME_MAP[ext] ? ext : null;
  } catch {
    return null;
  }
}

async function importImageFromUrlToWP(baseUrl, authHeader, asset) {
  const res = await fetch(asset.url);
  if (!res.ok) throw new Error(`Failed to download image from ${asset.url}: ${res.status}`);

  const contentType = res.headers.get("content-type");
  const ext = extFromContentType(contentType) || extFromUrl(asset.url) || ".jpg";
  const filename = `${asset.seo.filename_slug}${ext}`;
  const mimeType = MIME_MAP[ext] || "image/jpeg";
  const buffer = Buffer.from(await res.arrayBuffer());

  const uploaded = await wpUploadMediaBuffer(baseUrl, authHeader, buffer, filename, mimeType);
  await wpUpdateMediaMeta(baseUrl, authHeader, uploaded.id, {
    alt: asset.seo.alt,
    title: asset.seo.title,
    caption: asset.seo.caption,
  });

  console.log(`  [media] Imported URL image as media ${uploaded.id}: ${filename}`);
  return { cms_media_id: uploaded.id, wp_url: uploaded.source_url };
}

async function uploadLocalFileToWP(baseUrl, authHeader, asset) {
  const buffer = fs.readFileSync(asset.upload_path);
  const origExt = path.extname(asset.upload_path).toLowerCase();
  const ext = MIME_MAP[origExt] ? origExt : ".jpg";
  const filename = `${asset.seo.filename_slug}${ext}`;
  const mimeType = MIME_MAP[ext] || "image/jpeg";

  const uploaded = await wpUploadMediaBuffer(baseUrl, authHeader, buffer, filename, mimeType);
  await wpUpdateMediaMeta(baseUrl, authHeader, uploaded.id, {
    alt: asset.seo.alt,
    title: asset.seo.title,
    caption: asset.seo.caption,
  });

  console.log(`  [media] Uploaded local file as media ${uploaded.id}: ${filename}`);
  return { cms_media_id: uploaded.id, wp_url: uploaded.source_url };
}

async function resolveMediaAssets(baseUrl, authHeader, artifact) {
  const mediaAssets = artifact.media_assets || [];
  const contentBlocks = artifact.content_blocks || [];

  // Collect all asset_ids referenced by bindings
  const referencedIds = new Set();
  for (const block of contentBlocks) {
    if (!block.media_bindings) continue;
    for (const binding of block.media_bindings) {
      referencedIds.add(binding.asset_id);
    }
  }

  const resolvedMap = new Map();

  for (const asset of mediaAssets) {
    if (!referencedIds.has(asset.asset_id)) continue;

    let result;
    if (asset.source === "cms") {
      if (!asset.cms_media_id) {
        throw new Error(`[media] source="cms" requires cms_media_id for asset "${asset.asset_id}"`);
      }
      const media = await getMediaById(baseUrl, authHeader, asset.cms_media_id);
      result = { cms_media_id: media.id, wp_url: media.source_url };
      console.log(`  [media] Resolved CMS media ${media.id} for asset "${asset.asset_id}"`);
    } else if (asset.source === "url") {
      result = await importImageFromUrlToWP(baseUrl, authHeader, asset);
    } else if (asset.source === "upload") {
      result = await uploadLocalFileToWP(baseUrl, authHeader, asset);
    } else {
      throw new Error(`[media] unknown source "${asset.source}" for asset "${asset.asset_id}"`);
    }

    resolvedMap.set(asset.asset_id, {
      ...result,
      alt: asset.seo.alt,
      caption: asset.seo.caption || null,
      intent: asset.intent,
    });
  }

  return resolvedMap;
}

// ── Figure HTML builder and block embedding (D) ──

function buildFigureHtml({ wp_url, alt, caption, intent, alignment, size, link_to }) {
  const classes = ["bla-media", `bla-media--${intent}`];
  if (alignment) classes.push(`bla-media--${alignment}`);
  if (size) classes.push(`bla-media--${size}`);

  const imgTag = `<img src="${wp_url}" alt="${(alt || "").replace(/"/g, "&quot;")}" />`;
  const wrappedImg = link_to ? `<a href="${link_to}">${imgTag}</a>` : imgTag;
  const captionTag = caption ? `\n    <figcaption>${caption}</figcaption>` : "";

  return `<figure class="${classes.join(" ")}">
    ${wrappedImg}${captionTag}
  </figure>`;
}

function applyMediaBindingsToBlockHtml(blockHtml, bindings, resolvedMap) {
  if (!bindings || !bindings.length) return blockHtml;

  let html = blockHtml;

  for (const binding of bindings) {
    const resolved = resolvedMap.get(binding.asset_id);
    if (!resolved) continue;

    const figureHtml = buildFigureHtml({
      wp_url: resolved.wp_url,
      alt: resolved.alt,
      caption: resolved.caption,
      intent: resolved.intent,
      alignment: binding.alignment,
      size: binding.size,
      link_to: binding.link_to,
    });

    if (binding.placement === "above") {
      html = figureHtml + "\n" + html;
    } else if (binding.placement === "below") {
      html = html + "\n" + figureHtml;
    } else if (binding.placement === "inline") {
      const firstCloseP = html.indexOf("</p>");
      if (firstCloseP !== -1) {
        const insertAt = firstCloseP + 4;
        html = html.slice(0, insertAt) + "\n" + figureHtml + html.slice(insertAt);
      } else {
        html = html + "\n" + figureHtml;
      }
    }
  }

  return html;
}

// ── Main publish function ──

async function publish(artifact, opts = {}) {
  const { dryRun = false, updateTitle = false } = opts;

  // 1. Validate artifact shape
  if (!artifact || artifact.artifact_type !== "web_page") {
    throw new Error(`Expected artifact_type "web_page", got "${artifact?.artifact_type}"`);
  }

  const result = validateArtifact(artifact);
  if (!result.valid) {
    throw new Error(`Artifact validation failed:\n  - ${result.errors.join("\n  - ")}`);
  }

  // 2. Fail-fast media validation
  const hasBlocks = Array.isArray(artifact.content_blocks) && artifact.content_blocks.length > 0;
  const hasBindings = hasBlocks && artifact.content_blocks.some(
    (b) => Array.isArray(b.media_bindings) && b.media_bindings.length > 0
  );

  if (hasBindings) {
    validateMediaBindings(artifact);
  }

  const { target, content } = artifact;

  if (!target.slug && !target.page_id) {
    throw new Error("target must include either slug or page_id");
  }

  // 3. Resolve site config
  const site = resolveSiteConfig(target.site_key);
  const authHeader = basicAuthHeader(site.user, site.pass);

  // 4. Resolve page ID
  let pageId = target.page_id;
  const pageSlug = target.slug || null;

  if (!pageId) {
    if (dryRun) {
      console.log(`[dry-run] Would look up page ID by slug "${pageSlug}" on ${site.baseUrl}`);
      pageId = "(unknown — dry run)";
    } else {
      pageId = await getPageIdBySlug(site.baseUrl, authHeader, pageSlug);
    }
  }

  // 5. Build resolvedHtml
  let resolvedHtml;
  let resolvedMap = null;

  if (hasBlocks) {
    // 5a. Resolve media assets if bindings exist
    if (hasBindings && !dryRun) {
      resolvedMap = await resolveMediaAssets(site.baseUrl, authHeader, artifact);
    } else if (hasBindings && dryRun) {
      console.log(`[dry-run] Would resolve ${artifact.media_assets?.length || 0} media assets`);
      resolvedMap = new Map();
    }

    // 5b. Process each block
    const blockHtmlParts = [];
    for (const block of artifact.content_blocks) {
      let blockHtml = block.html;

      // Convert markdown if needed (only when content_format is not "html")
      if (artifact.content_format !== "html") {
        const { html, converted } = ensureHtml(blockHtml);
        blockHtml = html;
        if (converted) {
          console.log(`  [md→html] Converted block "${block.block_id}" markdown to HTML`);
        }
      }

      // Apply media bindings
      if (block.media_bindings && resolvedMap) {
        blockHtml = applyMediaBindingsToBlockHtml(blockHtml, block.media_bindings, resolvedMap);
      }

      blockHtmlParts.push(blockHtml);
    }

    resolvedHtml = blockHtmlParts.join("\n\n");
    console.log(`  [blocks] Assembled ${artifact.content_blocks.length} content blocks`);
  } else {
    // 5c. Legacy path: no content_blocks
    if (artifact.content_format === "html") {
      resolvedHtml = content.html;
      console.log(`  [html] content_format is html; skipping conversion`);
    } else {
      if (artifact.content_format) {
        console.log(`  [warn] web_page content_format is "${artifact.content_format}"; using fallback conversion`);
      } else {
        console.log(`  [warn] web_page content_format not html; using fallback conversion`);
      }
      const { html, converted } = ensureHtml(content.html);
      resolvedHtml = html;
      if (converted) {
        console.log(`  [md→html] Converted markdown content to HTML`);
      }
    }
  }

  // 6. Build WP payload
  const wpPayload = {
    content: resolvedHtml,
    status: content.status || "draft",
  };
  // Only overwrite the page title when --update-title is explicitly passed
  if (content.title && updateTitle) {
    wpPayload.title = content.title;
  } else if (content.title && !updateTitle) {
    console.log(`  [title] Skipping title update (use --update-title to overwrite). Title: "${content.title}"`);
  }

  // 7. Dry-run: print and return
  if (dryRun) {
    console.log(`[dry-run] Would update page ${pageId} on ${site.baseUrl}`);
    console.log(`[dry-run] Payload:`, JSON.stringify(wpPayload, null, 2));
    return { pageId, link: null, status: "dry-run" };
  }

  // 8. Push to WP
  const updateUrl = `${site.baseUrl}/wp-json/wp/v2/pages/${pageId}`;
  const res = await fetch(updateUrl, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(wpPayload),
  });

  const data = await res.json();

  if (!res.ok) {
    const msg = data.message || JSON.stringify(data);
    throw new Error(`WP update failed (${res.status}): ${msg}`);
  }

  // 9. Log
  appendLog({
    artifact_id: artifact.artifact_id,
    site_key: target.site_key,
    page_slug: pageSlug,
    page_id: pageId,
    status: wpPayload.status,
    link: data.link,
    media_count: resolvedMap ? resolvedMap.size : 0,
  });

  console.log(`Published page ${pageId} on ${target.site_key} -> ${data.link}`);
  return { pageId, link: data.link, status: wpPayload.status };
}

// ── CLI entry ──

if (require.main === module) {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const updateTitle = args.includes("--update-title");
  const filePath = args.find((a) => !a.startsWith("--"));

  if (!filePath) {
    console.error("Usage: node publishers/web/wpElementorStaging.js <artifact.json> [--dry-run] [--update-title]");
    process.exit(1);
  }

  let artifact;
  try {
    artifact = JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
  } catch (err) {
    console.error(`Failed to read artifact file: ${err.message}`);
    process.exit(1);
  }

  publish(artifact, { dryRun, updateTitle }).catch((err) => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });
}

module.exports = {
  publish,
  // Exported for testing
  validateMediaBindings,
  buildFigureHtml,
  applyMediaBindingsToBlockHtml,
  resolveMediaAssets,
  wpUploadMediaBuffer,
  wpUpdateMediaMeta,
  getMediaById,
  importImageFromUrlToWP,
  uploadLocalFileToWP,
};
