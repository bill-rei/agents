export { BrandConfigSchema } from "./schema";
export type { BrandConfig } from "./schema";

export { BRAND_REGISTRY, BRAND_KEYS, FALLBACK_BRAND_KEY } from "./registry";

export { getBrand, resolveBrandKey, subdomainFromHost } from "./getBrand";
export { getBrandOrThrow } from "./getBrandOrThrow";
