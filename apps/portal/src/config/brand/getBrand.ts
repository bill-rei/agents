import type { BrandConfig } from "./schema";
import { BRAND_REGISTRY, FALLBACK_BRAND_KEY } from "./registry";

/**
 * Resolve a brand key to its BrandConfig.
 *
 * Resolution order:
 *   1. Explicit key argument (passed from query param or cookie)
 *   2. DEFAULT_BRAND_KEY env var
 *   3. Hard fallback: "mycoachbill"
 *
 * Returns null only if the resolved key is not in the registry.
 * Use getBrandOrThrow when a missing brand should be an error.
 */
export function getBrand(key?: string | null): BrandConfig | null {
  const candidates = [
    key,
    process.env.DEFAULT_BRAND_KEY,
    FALLBACK_BRAND_KEY,
  ];

  for (const candidate of candidates) {
    if (candidate && BRAND_REGISTRY[candidate]) {
      return BRAND_REGISTRY[candidate];
    }
  }

  return null;
}

/**
 * Resolve the active brand key from the full priority chain.
 *
 * Resolution order (server-side call — pass parsed values from request):
 *   1. queryBrand  — ?brand=<key> query param
 *   2. cookieBrand — brandKey cookie value
 *   3. subdomain   — first label of the Host header (e.g. "mycoachbill" from mycoachbill.example.com)
 *   4. DEFAULT_BRAND_KEY env var
 *   5. Hard fallback: "mycoachbill"
 *
 * Only values that exist in the registry are accepted at steps 1–3.
 */
export function resolveBrandKey(opts: {
  queryBrand?: string | null;
  cookieBrand?: string | null;
  subdomain?: string | null;
}): string {
  const { queryBrand, cookieBrand, subdomain } = opts;

  const candidates = [
    queryBrand,
    cookieBrand,
    subdomain,
    process.env.DEFAULT_BRAND_KEY,
    FALLBACK_BRAND_KEY,
  ];

  for (const candidate of candidates) {
    if (candidate && BRAND_REGISTRY[candidate]) {
      return candidate;
    }
  }

  return FALLBACK_BRAND_KEY;
}

/**
 * Extract a subdomain brand hint from a Host header value.
 * Returns null for "www", "localhost", numeric IPs, or single-label hosts.
 */
export function subdomainFromHost(host: string | null | undefined): string | null {
  if (!host) return null;
  const hostname = host.split(":")[0]; // strip port
  const labels = hostname.split(".");
  if (labels.length < 2) return null;             // bare hostname
  const first = labels[0];
  if (first === "www") return null;
  if (/^\d+$/.test(first)) return null;           // numeric IP segment
  if (first === "localhost") return null;
  return first;
}
