import { z } from "zod";

// ── Logo ──────────────────────────────────────────────────────────────────────

export const BrandLogoSchema = z.object({
  /** Path or URL for light backgrounds (e.g. dark logo) */
  light: z.string().min(1),
  /** Path or URL for dark backgrounds (e.g. white logo) */
  dark: z.string().min(1),
});

// ── Theme ─────────────────────────────────────────────────────────────────────

export const BrandThemeSchema = z.object({
  /** Primary action / accent colour (CSS hex or tailwind token) */
  primaryColor: z.string().min(1),
  /** Secondary accent colour */
  accentColor: z.string().min(1),
});

// ── Social defaults ───────────────────────────────────────────────────────────

export const BrandSocialDefaultsSchema = z.object({
  /** X / Twitter handle (without @) */
  xHandle: z.string().optional(),
  /** LinkedIn organisation slug */
  linkedinOrg: z.string().optional(),
  /** Default hashtags included in posts (without #) */
  defaultHashtags: z.array(z.string()).default([]),
});

// ── Publish targets ───────────────────────────────────────────────────────────

export const BrandPublishTargetsSchema = z.object({
  /** GitHub repository name (org/repo) for web publishing */
  githubRepo: z.string().optional(),
  /** WordPress staging base URL */
  wpStagingUrl: z.string().optional(),
  /** Any additional named targets */
  extras: z.record(z.string(), z.string()).default({}),
});

// ── Content guardrails ────────────────────────────────────────────────────────

export const BrandContentGuardrailsSchema = z.object({
  /** Whether the system must include privacy/data-ownership language in all copy */
  privacyLanguageRequired: z.boolean().default(false),
  /** Whether every artifact requires human approval before publishing */
  approvalRequired: z.boolean().default(true),
  /** Max content phase allowed (e.g. 2 means Phase 1–2 only) */
  maxPhase: z.number().int().min(1).default(2),
  /** Terms that must never appear in generated copy */
  prohibitedTerms: z.array(z.string()).default([]),
});

// ── Root BrandConfig schema ───────────────────────────────────────────────────

export const BrandConfigSchema = z.object({
  /** Unique machine-readable brand key (slug, no spaces) */
  brandKey: z.string().min(1).regex(/^[a-z0-9-]+$/, "Must be lowercase alphanumeric with hyphens"),
  /** Human-readable display name */
  displayName: z.string().min(1),
  /** Legal entity name */
  legalName: z.string().min(1),
  /** Primary domain (without protocol) */
  primaryDomain: z.string().min(1),
  /** Support / contact email */
  supportEmail: z.string().email(),
  /** Logo paths */
  logo: BrandLogoSchema,
  /** Colour tokens */
  theme: BrandThemeSchema,
  /** Social platform defaults */
  socialDefaults: BrandSocialDefaultsSchema,
  /** Publishing target configuration */
  publishTargets: BrandPublishTargetsSchema,
  /** Compliance / content guardrails */
  contentGuardrails: BrandContentGuardrailsSchema,
});

export type BrandConfig = z.infer<typeof BrandConfigSchema>;
