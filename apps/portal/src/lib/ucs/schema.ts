import { z } from "zod";
import { BRAND_KEYS } from "@/config/brand";

/**
 * UCS_BRAND_MODES is derived from the brand registry so adding a brand in
 * registry.ts automatically makes it valid here — no manual sync needed.
 *
 * Kept as a runtime array (not a const tuple) so the type stays `string`
 * rather than a union literal — this avoids breaking existing consumers
 * that pass arbitrary brandKey strings.
 */
export const UCS_BRAND_MODES: string[] = BRAND_KEYS;
export const UCS_STATUSES = ["draft", "in_review", "approved"] as const;
export const UCS_CHANNELS = ["linkedin", "x", "instagram", "tiktok", "reddit", "website"] as const;

export type UCSBrandMode = string; // any registered brandKey
export type UCSStatus = (typeof UCS_STATUSES)[number];
export type UCSChannel = (typeof UCS_CHANNELS)[number];

// ── Canonical content ─────────────────────────────────────────────────────────

export const UCSMediaRefSchema = z.object({
  ref: z.string().min(1),
  alt: z.string().optional(),
  caption: z.string().optional(),
});

export const UCSLinkSchema = z.object({
  label: z.string().min(1),
  url: z.string().url("Must be a valid URL"),
});

export const UCSCanonicalSchema = z.object({
  hook: z.string().min(1, "Hook is required"),
  body: z.string().min(1, "Body is required"),
  callToAction: z.string().optional(),
  hashtags: z.array(z.string()).max(30).optional(),
  links: z.array(UCSLinkSchema).optional(),
  mediaRefs: z.array(UCSMediaRefSchema).optional(),
  tone: z.string().optional(),
  targetAudience: z.string().optional(),
});

// ── Per-channel overrides ─────────────────────────────────────────────────────

const BaseChannelOverrideSchema = z.object({
  hook: z.string().optional(),
  body: z.string().optional(),
  callToAction: z.string().optional(),
  hashtags: z.array(z.string()).optional(),
});

const RedditOverrideSchema = BaseChannelOverrideSchema.extend({
  subreddit: z.string().optional(),
  title: z.string().optional(),
  firstComment: z.string().optional(),
});

const WebsiteOverrideSchema = z.object({
  slug: z.string().optional(),
  metaDescription: z.string().max(160).optional(),
  featuredImageRef: z.string().optional(),
  body: z.string().optional(),
});

export const UCSOverridesSchema = z.object({
  linkedin: BaseChannelOverrideSchema.optional(),
  x: BaseChannelOverrideSchema.optional(),
  instagram: BaseChannelOverrideSchema.optional(),
  tiktok: BaseChannelOverrideSchema.optional(),
  reddit: RedditOverrideSchema.optional(),
  website: WebsiteOverrideSchema.optional(),
});

// ── Top-level payloads ────────────────────────────────────────────────────────

export const CreateUCSSchema = z.object({
  brandMode: z.string().min(1),
  title: z.string().min(1, "Title is required"),
  canonical: UCSCanonicalSchema,
});

export const UpdateUCSSchema = z.object({
  title: z.string().min(1).optional(),
  canonical: UCSCanonicalSchema.partial().optional(),
  overrides: UCSOverridesSchema.optional(),
  status: z.enum(UCS_STATUSES).optional(),
});

// ── TypeScript types ──────────────────────────────────────────────────────────

export type UCSCanonical = z.infer<typeof UCSCanonicalSchema>;
export type UCSOverrides = z.infer<typeof UCSOverridesSchema>;
export type CreateUCSPayload = z.infer<typeof CreateUCSSchema>;
export type UpdateUCSPayload = z.infer<typeof UpdateUCSSchema>;

export interface UCSMessage {
  id: string;
  brandMode: UCSBrandMode;
  title: string;
  canonical: UCSCanonical;
  overrides: UCSOverrides;
  renders: Record<string, string>; // channel key → rendered text
  status: UCSStatus;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}
