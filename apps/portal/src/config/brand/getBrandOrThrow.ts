import { getBrand } from "./getBrand";
import type { BrandConfig } from "./schema";

/**
 * Like getBrand() but throws if the key resolves to an unknown brand.
 * Use in API routes where an unrecognised brand key should be a 400 error.
 */
export function getBrandOrThrow(key?: string | null): BrandConfig {
  const config = getBrand(key);
  if (!config) {
    throw new Error(
      `Unknown brand key: "${key}". ` +
        `Register it in src/config/brand/registry.ts or set DEFAULT_BRAND_KEY.`
    );
  }
  return config;
}
