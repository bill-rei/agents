import { z } from "zod";

// ── Enums ──

export const BrandEnum = z.enum(["llif", "bestlife"]);
export type Brand = z.infer<typeof BrandEnum>;

export const CampaignTypeEnum = z.enum([
  "use_case",
  "feature",
  "thematic",
  "release",
  "program",
]);
export type CampaignType = z.infer<typeof CampaignTypeEnum>;

// ── Sub-schemas ──

export const MetaSchema = z.object({
  brand: BrandEnum,
  campaign_type: CampaignTypeEnum,
  version: z.string().min(1),
  last_updated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
});

export const HeroSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional(),
  eyebrow: z.string().optional(),
});

export const TldrSchema = z.object({
  summary: z.string().min(1),
});

export const SectionSchema = z.object({
  heading: z.string().min(1),
  body: z.string(),
  bullets: z.array(z.string()).optional(),
});

export const PrivacyBlockSchema = z.object({
  enabled: z.boolean(),
  text: z.string().optional(),
});

export const CtaSchema = z.object({
  headline: z.string().min(1),
  button_text: z.string().min(1),
  button_url: z.string().url().startsWith("https://", "Must be an HTTPS URL"),
});

// ── Root schema ──

export const DesignContractSchema = z.object({
  meta: MetaSchema,
  hero: HeroSchema,
  tldr: TldrSchema,
  sections: z.array(SectionSchema).min(1).max(6),
  privacy_block: PrivacyBlockSchema.optional(),
  cta: CtaSchema,
});

export type DesignContract = z.infer<typeof DesignContractSchema>;
