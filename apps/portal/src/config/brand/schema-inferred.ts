import type { z } from "zod";
import type {
  BrandLogoSchema,
  BrandThemeSchema,
  BrandSocialDefaultsSchema,
  BrandPublishTargetsSchema,
  BrandContentGuardrailsSchema,
} from "./schema";

export type BrandLogo = z.infer<typeof BrandLogoSchema>;
export type BrandTheme = z.infer<typeof BrandThemeSchema>;
export type BrandSocialDefaults = z.infer<typeof BrandSocialDefaultsSchema>;
export type BrandPublishTargets = z.infer<typeof BrandPublishTargetsSchema>;
export type BrandContentGuardrails = z.infer<typeof BrandContentGuardrailsSchema>;
