// ── Target types ──────────────────────────────────────────────

export type StagingSiteKey = "llif-staging" | "bestlife-staging";

export interface WebPageTarget {
  platform: "wordpress";
  site_key: StagingSiteKey;
  slug?: string;
  page_id?: number;
  elementor?: boolean;
}

export interface SocialPostTarget {
  platform: "x" | "linkedin" | "reddit" | "facebook" | "instagram";
  account_type?: "organization" | "person";
  reddit_mode?: "discussion" | "value_first" | "ama";
}

export interface BlogPostTarget {
  platform: string;
  category?: string;
}

// ── Content types ─────────────────────────────────────────────

export interface WebPageContent {
  title: string;
  html: string;
  status?: "draft" | "publish";
}

export interface SocialPostContent {
  body: string;
  hashtags?: string[];
  cta?: string;
  media_urls?: string[];
}

export interface BlogPostContent {
  title: string;
  markdown: string;
  excerpt?: string;
}

// ── Shared types ──────────────────────────────────────────────

export interface Provenance {
  agent: string;
  created_at: string;
  session_id?: string;
}

export type ArtifactType = "web_page" | "social_post" | "blog_post";
export type ArtifactStatus = "draft" | "review" | "approved" | "published" | "rejected";

// ── Artifact variants ─────────────────────────────────────────

interface ArtifactBase {
  artifact_id: string;
  brand: string;
  status: ArtifactStatus;
  provenance: Provenance;
  schedule_at?: string;
  constraints?: string[];
  review_notes?: string;
  human_approval?: boolean;
  metadata?: Record<string, unknown>;
}

export interface WebPageArtifact extends ArtifactBase {
  artifact_type: "web_page";
  target: WebPageTarget;
  content: WebPageContent;
}

export interface SocialPostArtifact extends ArtifactBase {
  artifact_type: "social_post";
  target: SocialPostTarget;
  content: SocialPostContent;
}

export interface BlogPostArtifact extends ArtifactBase {
  artifact_type: "blog_post";
  target: BlogPostTarget;
  content: BlogPostContent;
}

export type MarketingArtifact = WebPageArtifact | SocialPostArtifact | BlogPostArtifact;

// ── Validator ─────────────────────────────────────────────────

export interface ValidationSuccess {
  valid: true;
}

export interface ValidationFailure {
  valid: false;
  errors: string[];
}

export type ValidationResult = ValidationSuccess | ValidationFailure;

export function validateArtifact(artifact: unknown): ValidationResult;
export function validateArtifactFile(filePath: string): ValidationResult;

export { default as schema } from "./schema";
