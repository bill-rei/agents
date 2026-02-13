import fs from "fs";
import path from "path";

const REPO_ROOT = process.env.AGENTS_REPO_ROOT || path.resolve(process.cwd(), "../..");
const TARGETS_DIR = path.join(REPO_ROOT, "targets");

export interface PageEntry {
  slug: string;
  title: string;
  page_id?: number;
}

export interface SiteRegistry {
  site_key: string;
  label: string;
  environment: string;
  base_url_env: string;
  aliases?: Record<string, string>;
  pages: Record<string, PageEntry>;
}

export function listSiteKeys(): string[] {
  if (!fs.existsSync(TARGETS_DIR)) return [];
  return fs
    .readdirSync(TARGETS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));
}

export function loadRegistry(siteKey: string): SiteRegistry {
  const filePath = path.join(TARGETS_DIR, `${siteKey}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`No target registry found for "${siteKey}". Expected: targets/${siteKey}.json`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

/**
 * Normalize a page_key through the site's alias map.
 * If the key is an alias, returns the canonical page_key.
 */
export function normalizePageKey(siteKey: string, pageKey: string): string {
  const reg = loadRegistry(siteKey);
  const aliases = reg.aliases || {};
  return aliases[pageKey] || pageKey;
}

export function listSitesWithPages(): Array<SiteRegistry & { pageKeys: string[] }> {
  return listSiteKeys().map((key) => {
    const reg = loadRegistry(key);
    return { ...reg, pageKeys: Object.keys(reg.pages || {}) };
  });
}
