#!/usr/bin/env node
require("dotenv").config({ path: require("path").join(__dirname, "..", "..", ".env") });

const fs = require("fs");
const path = require("path");
const { validateArtifact } = require("../../marketing-artifacts");

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
  if (!baseUrl.includes("staging")) {
    throw new Error(
      `Refusing to publish: URL for "${siteKey}" does not contain "staging" (${baseUrl}). ` +
      "This adapter only targets staging environments."
    );
  }

  return { baseUrl, user, pass };
}

// ── Logging ──

function appendLog(entry) {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), ...entry }) + "\n";
  fs.appendFileSync(LOG_PATH, line, "utf8");
}

// ── Main publish function ──

async function publish(artifact, opts = {}) {
  const { dryRun = false } = opts;

  // 1. Validate
  if (!artifact || artifact.artifact_type !== "web_page") {
    throw new Error(`Expected artifact_type "web_page", got "${artifact?.artifact_type}"`);
  }

  const result = validateArtifact(artifact);
  if (!result.valid) {
    throw new Error(`Artifact validation failed:\n  - ${result.errors.join("\n  - ")}`);
  }

  const { target, content } = artifact;

  if (!target.slug && !target.page_id) {
    throw new Error("target must include either slug or page_id");
  }

  // 2. Resolve site config
  const site = resolveSiteConfig(target.site_key);
  const authHeader = basicAuthHeader(site.user, site.pass);

  // 3. Resolve page ID
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

  // 4. Build WP payload
  const wpPayload = {
    content: content.html,
    status: content.status || "draft",
  };
  if (content.title) {
    wpPayload.title = content.title;
  }

  // 5. Dry-run: print and return
  if (dryRun) {
    console.log(`[dry-run] Would update page ${pageId} on ${site.baseUrl}`);
    console.log(`[dry-run] Payload:`, JSON.stringify(wpPayload, null, 2));
    return { pageId, link: null, status: "dry-run" };
  }

  // 6. Push to WP
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

  // 7. Log
  appendLog({
    artifact_id: artifact.artifact_id,
    site_key: target.site_key,
    page_slug: pageSlug,
    page_id: pageId,
    status: wpPayload.status,
    link: data.link,
  });

  console.log(`Published page ${pageId} on ${target.site_key} -> ${data.link}`);
  return { pageId, link: data.link, status: wpPayload.status };
}

// ── CLI entry ──

if (require.main === module) {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const filePath = args.find((a) => !a.startsWith("--"));

  if (!filePath) {
    console.error("Usage: node publishers/web/wpElementorStaging.js <artifact.json> [--dry-run]");
    process.exit(1);
  }

  let artifact;
  try {
    artifact = JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8"));
  } catch (err) {
    console.error(`Failed to read artifact file: ${err.message}`);
    process.exit(1);
  }

  publish(artifact, { dryRun }).catch((err) => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { publish };
