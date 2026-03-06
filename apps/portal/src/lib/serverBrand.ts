import { cookies, headers } from "next/headers";
import { resolveBrandKey, subdomainFromHost, getBrand, getBrandOrThrow } from "@/config/brand";
import type { BrandConfig } from "@/config/brand";

const BRAND_COOKIE = "brandKey";

/**
 * Resolve the active BrandConfig in a Server Component or Route Handler.
 * Call with no arguments; reads cookies + headers automatically.
 * Returns null if resolution produces an unregistered key (should not happen in practice).
 */
export async function getServerBrand(): Promise<BrandConfig | null> {
  const cookieStore = await cookies();
  const headerStore = await headers();

  const cookieBrand = cookieStore.get(BRAND_COOKIE)?.value ?? null;
  const host = headerStore.get("host");
  const subdomain = subdomainFromHost(host);

  const brandKey = resolveBrandKey({ cookieBrand, subdomain });
  return getBrand(brandKey);
}

/**
 * Like getServerBrand() but throws if the brand cannot be resolved.
 */
export async function requireServerBrand(): Promise<BrandConfig> {
  const cookieStore = await cookies();
  const headerStore = await headers();

  const cookieBrand = cookieStore.get(BRAND_COOKIE)?.value ?? null;
  const host = headerStore.get("host");
  const subdomain = subdomainFromHost(host);

  const brandKey = resolveBrandKey({ cookieBrand, subdomain });
  return getBrandOrThrow(brandKey);
}
