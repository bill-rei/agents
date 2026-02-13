/**
 * Target Registry — resolves (site_key, page_key) to slugs and base URLs.
 *
 * Registry files live in /targets/<site_key>.json.
 * Credentials stay in .env; this module only handles slugs, page IDs,
 * and site metadata.
 */

const fs = require("fs");
const path = require("path");

const TARGETS_DIR = path.join(__dirname, "..", "targets");

// In-memory cache keyed by site_key
const _cache = new Map();

/**
 * Load a site registry by site_key.
 * Reads from /targets/<site_key>.json and caches the result.
 *
 * @param {string} siteKey  e.g. "llif-staging"
 * @returns {object} The parsed registry object
 */
function loadRegistry(siteKey) {
  if (_cache.has(siteKey)) return _cache.get(siteKey);

  const filePath = path.join(TARGETS_DIR, `${siteKey}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `No target registry found for site_key "${siteKey}". ` +
      `Expected file: targets/${siteKey}.json`
    );
  }

  const registry = JSON.parse(fs.readFileSync(filePath, "utf8"));

  // Sanity checks
  if (registry.site_key !== siteKey) {
    throw new Error(
      `Registry file targets/${siteKey}.json has mismatched site_key: "${registry.site_key}"`
    );
  }
  if (!registry.environment) {
    throw new Error(`Registry for "${siteKey}" is missing required field "environment"`);
  }

  _cache.set(siteKey, registry);
  return registry;
}

/**
 * Resolve a page_key to its slug (and optional page_id) for a given site.
 *
 * @param {string} siteKey  e.g. "llif-staging"
 * @param {string} pageKey  e.g. "home", "about"
 * @returns {{ slug: string, page_id?: number, title?: string }}
 */
function resolvePageSlug(siteKey, pageKey) {
  const registry = loadRegistry(siteKey);
  const page = registry.pages && registry.pages[pageKey];

  if (!page) {
    const available = registry.pages ? Object.keys(registry.pages).join(", ") : "(none)";
    throw new Error(
      `Unknown page_key "${pageKey}" for site "${siteKey}". ` +
      `Available keys: ${available}`
    );
  }

  return page;
}

/**
 * Resolve the base URL for a site from env vars.
 * The registry stores which env var to read (base_url_env).
 *
 * @param {string} siteKey
 * @returns {string} The base URL (trailing slash stripped)
 */
function resolveBaseUrl(siteKey) {
  const registry = loadRegistry(siteKey);
  const envVar = registry.base_url_env;

  if (!envVar) {
    throw new Error(`Registry for "${siteKey}" is missing base_url_env`);
  }

  const url = process.env[envVar];
  if (!url) {
    throw new Error(
      `Env var ${envVar} is not set (required by site "${siteKey}")`
    );
  }

  return url.replace(/\/$/, "");
}

/**
 * List all available site keys by scanning the targets/ directory.
 *
 * @returns {string[]}
 */
function listSiteKeys() {
  if (!fs.existsSync(TARGETS_DIR)) return [];
  return fs
    .readdirSync(TARGETS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));
}

/**
 * List all page keys for a given site.
 *
 * @param {string} siteKey
 * @returns {string[]}
 */
function listPageKeys(siteKey) {
  const registry = loadRegistry(siteKey);
  return Object.keys(registry.pages || {});
}

/**
 * Clear the in-memory cache (useful for testing).
 */
function clearCache() {
  _cache.clear();
}

module.exports = {
  loadRegistry,
  resolvePageSlug,
  resolveBaseUrl,
  listSiteKeys,
  listPageKeys,
  clearCache,
};
