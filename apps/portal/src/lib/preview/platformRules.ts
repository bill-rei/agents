/**
 * Per-platform rules for social post preview validation.
 * Phase 3 — static defaults; adjust as platform policies change.
 */

export type SocialPlatform = "x" | "linkedin" | "instagram";

export interface PlatformRule {
  /** Display name. */
  label: string;
  /** Hard character limit (X=280) or soft warning threshold. */
  charLimit: number;
  /** Whether charLimit is a hard cap (truncation) or a soft warning. */
  charLimitHard: boolean;
  /** Recommended media aspect ratio string for display. */
  recommendedAspect: string;
  /** Numeric aspect ratio(s) [w/h]. Used to compute likelyCropped. */
  recommendedAspectRatios: number[];
  /** Tolerance before flagging a crop: e.g. 0.25 means ±25% of recommended ratio. */
  aspectTolerance: number;
  /** Platform-specific warnings to always include. */
  staticWarnings: string[];
}

export const PLATFORM_RULES: Record<SocialPlatform, PlatformRule> = {
  x: {
    label: "X (Twitter)",
    charLimit: 280,
    charLimitHard: true,
    recommendedAspect: "16:9 or 1:1",
    recommendedAspectRatios: [16 / 9, 1],
    aspectTolerance: 0.3,
    staticWarnings: [],
  },
  linkedin: {
    label: "LinkedIn",
    charLimit: 3000,
    charLimitHard: false,
    recommendedAspect: "1.91:1 or 1:1",
    recommendedAspectRatios: [1.91, 1],
    aspectTolerance: 0.35,
    staticWarnings: [],
  },
  instagram: {
    label: "Instagram",
    charLimit: 2200,
    charLimitHard: false,
    recommendedAspect: "4:5 portrait",
    recommendedAspectRatios: [4 / 5],
    aspectTolerance: 0.3,
    staticWarnings: [
      "Links in captions are not clickable on Instagram. Move URLs to the bio or use link-in-bio.",
    ],
  },
};

export const PLATFORMS: SocialPlatform[] = ["x", "linkedin", "instagram"];
