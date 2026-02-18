import fs from "fs";
import path from "path";

const REPO_ROOT = process.env.AGENTS_REPO_ROOT || path.resolve(process.cwd(), "../..");
const TARGETS_DIR = path.join(REPO_ROOT, "targets");

// ── Types ──

export interface PageEntry {
  slug: string;
  title: string;
  page_id?: number;
}

export interface SocialChannelEntry {
  label: string;
}

interface BaseRegistry {
  site_key: string;
  label: string;
  type?: "web" | "social";
  brand?: string;
  environment: string;
}

export interface WebRegistry extends BaseRegistry {
  type?: "web";
  base_url_env: string;
  aliases?: Record<string, string>;
  pages: Record<string, PageEntry>;
}

export interface SocialRegistry extends BaseRegistry {
  type: "social";
  channels: Record<string, SocialChannelEntry>;
}

export type TargetRegistry = WebRegistry | SocialRegistry;

/** @deprecated Use TargetRegistry instead */
export type SiteRegistry = WebRegistry;

// ── Loading ──

export function listSiteKeys(): string[] {
  if (!fs.existsSync(TARGETS_DIR)) return [];
  return fs
    .readdirSync(TARGETS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""));
}

export function loadRegistry(siteKey: string): TargetRegistry {
  const filePath = path.join(TARGETS_DIR, `${siteKey}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`No target registry found for "${siteKey}". Expected: targets/${siteKey}.json`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

// ── Helpers ──

/** Derive brand from a target registry (explicit field or prefix convention). */
export function deriveBrandFromTarget(reg: TargetRegistry): string {
  if (reg.brand) return reg.brand.toLowerCase();
  return reg.site_key.startsWith("llif") ? "llif" : "bestlife";
}

/** Get the effective type of a target ("web" if not specified, for backward compat). */
export function getTargetType(reg: TargetRegistry): "web" | "social" {
  return reg.type === "social" ? "social" : "web";
}

/**
 * Normalize a page_key through the site's alias map.
 * If the key is an alias, returns the canonical page_key.
 */
export function normalizePageKey(siteKey: string, pageKey: string): string {
  const reg = loadRegistry(siteKey);
  if (getTargetType(reg) !== "web") return pageKey;
  const aliases = (reg as WebRegistry).aliases || {};
  return aliases[pageKey] || pageKey;
}

// ── Listing ──

/** @deprecated Use listAllTargets() for richer data including social targets */
export function listSitesWithPages(): Array<WebRegistry & { pageKeys: string[] }> {
  return listSiteKeys()
    .map((key) => loadRegistry(key))
    .filter((reg): reg is WebRegistry => getTargetType(reg) === "web")
    .map((reg) => ({ ...reg, pageKeys: Object.keys(reg.pages || {}) }));
}

export interface TargetSummary {
  site_key: string;
  label: string;
  type: "web" | "social";
  brand: string;
  environment: string;
  pageKeys?: string[];
  pages?: Record<string, PageEntry>;
  channelKeys?: string[];
}

export function listAllTargets(): TargetSummary[] {
  return listSiteKeys().map((key) => {
    const reg = loadRegistry(key);
    const type = getTargetType(reg);
    const base: TargetSummary = {
      site_key: reg.site_key,
      label: reg.label,
      type,
      brand: deriveBrandFromTarget(reg),
      environment: reg.environment,
    };
    if (type === "web") {
      const webReg = reg as WebRegistry;
      base.pageKeys = Object.keys(webReg.pages || {});
      base.pages = webReg.pages;
    } else {
      base.channelKeys = Object.keys((reg as SocialRegistry).channels || {});
    }
    return base;
  });
}

export function listTargetsByBrand(brand: string): TargetSummary[] {
  return listAllTargets().filter((t) => t.brand === brand.toLowerCase());
}

// ── Brand boundary validation ──

export interface BrandValidation {
  valid: boolean;
  brand: string | null;
  error?: string;
}

export function validateBrandBoundary(targetKeys: string[]): BrandValidation {
  if (targetKeys.length === 0) {
    return { valid: false, brand: null, error: "At least one target is required" };
  }

  const brands = targetKeys.map((key) => {
    const reg = loadRegistry(key);
    return deriveBrandFromTarget(reg);
  });

  const unique = [...new Set(brands)];
  if (unique.length > 1) {
    return {
      valid: false,
      brand: null,
      error: `Cannot mix brands in the same project: ${unique.join(", ")}. Select targets from one brand only.`,
    };
  }

  return { valid: true, brand: unique[0] };
}

// ── Target filtering by artifact type ──

export function getTargetsForArtifactType(
  targetKeys: string[],
  artifactType: string
): TargetRegistry[] {
  return targetKeys
    .map((key) => loadRegistry(key))
    .filter((reg) => {
      const type = getTargetType(reg);
      if (artifactType === "web_page" || artifactType === "blog_post") return type === "web";
      if (artifactType === "social_post") return type === "social";
      return true;
    });
}
