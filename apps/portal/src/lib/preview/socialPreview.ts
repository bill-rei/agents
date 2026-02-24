/**
 * Social Preview normalization.
 *
 * Takes the Distributor agent's Markdown output and normalizes it into
 * per-platform SocialPostPreview objects with warnings, char counts, and
 * crop guidance. No LLM calls — purely deterministic transforms.
 */

import { PLATFORM_RULES, PLATFORMS, type SocialPlatform } from "./platformRules";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CropGuidance {
  recommendedAspect: string;
  safeAreaNote: string;
  likelyCropped: boolean;
}

export interface MediaPreview {
  url: string;
  width?: number;
  height?: number;
  alt?: string;
}

export interface SocialPostPreview {
  platform: SocialPlatform;
  text: string;
  hashtags: string[];
  link: string | null;
  media: MediaPreview | null;
  metadata: {
    charCount: number;
    charLimit: number;
    charLimitHard: boolean;
    warnings: string[];
    cropGuidance: CropGuidance;
  };
}

// ── Public helpers ────────────────────────────────────────────────────────────

/** Extract all #hashtags from text (preserving order of appearance). */
export function extractHashtags(text: string): string[] {
  const matches = text.match(/#[A-Za-z]\w*/g);
  return matches ? [...new Set(matches)] : [];
}

/** Extract the first URL from text (http/https). */
export function extractFirstLink(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s)>\]"']+/);
  return m ? m[0] : null;
}

/** Count raw characters in text. */
export function computeCharCount(text: string): string extends never ? never : number {
  return text.length as number;
}

/**
 * Compute crop guidance for the given media on a platform.
 * If media dimensions are unknown, returns a conservative warning.
 */
export function assessCropGuidance(
  media: MediaPreview | null,
  platform: SocialPlatform
): CropGuidance {
  const rules = PLATFORM_RULES[platform];
  const recommended = rules.recommendedAspect;

  if (!media) {
    return {
      recommendedAspect: recommended,
      safeAreaNote: `No media attached. Recommended aspect: ${recommended}.`,
      likelyCropped: false,
    };
  }

  if (!media.width || !media.height) {
    return {
      recommendedAspect: recommended,
      safeAreaNote: `Dimensions unknown — crop may occur. Recommended aspect: ${recommended}.`,
      likelyCropped: false,
    };
  }

  const actual = media.width / media.height;
  const closestDiff = Math.min(
    ...rules.recommendedAspectRatios.map((r) => Math.abs(actual - r) / r)
  );
  const likelyCropped = closestDiff > rules.aspectTolerance;

  return {
    recommendedAspect: recommended,
    safeAreaNote: likelyCropped
      ? `Image aspect ratio ${(actual).toFixed(2)}:1 differs from recommended ${recommended} — cropping likely.`
      : `Image aspect ratio ${(actual).toFixed(2)}:1 is within acceptable range for ${recommended}.`,
    likelyCropped,
  };
}

// ── Distributor Markdown parser ───────────────────────────────────────────────

/**
 * Parse a Distributor step's markdownOutput and extract per-platform text.
 *
 * Strategy:
 *  1. Find "## Outputs" section.
 *  2. Split on ### sub-headings or **bold:** channel markers.
 *  3. Match heading text to platform by keyword.
 *  4. Fall back to the full Outputs section for platforms with no explicit section.
 */
export function parseDistributorOutputs(markdown: string): Record<SocialPlatform, string> {
  const result: Record<SocialPlatform, string> = { x: "", linkedin: "", instagram: "" };

  if (!markdown) return result;

  // Extract ## Outputs section (no m flag so $ = true end of string, not end of line)
  const outputsMatch = markdown.match(
    /##\s+Outputs\s*\n([\s\S]*?)(?=\n##\s|$)/
  );
  const outputsBody = outputsMatch ? outputsMatch[1] : markdown;

  // Try ### sub-headings first
  const subSections = splitOnH3OrBold(outputsBody);

  if (subSections.length > 0) {
    for (const { heading, content } of subSections) {
      const platform = matchPlatform(heading);
      if (platform && content.trim()) {
        result[platform] = content.trim();
      }
    }
  }

  // Fall back: if no platform-specific sections found, use full Outputs body for all
  const anyAssigned = PLATFORMS.some((p) => result[p].length > 0);
  if (!anyAssigned) {
    const fallback = outputsBody.trim();
    for (const p of PLATFORMS) result[p] = fallback;
  }

  return result;
}

/**
 * Build SocialPostPreview[] from a Distributor step's markdownOutput + optional media assets.
 */
export function buildPreviewFromDistributorOutput(
  markdownOutput: string,
  media?: MediaPreview | null
): SocialPostPreview[] {
  const channelTexts = parseDistributorOutputs(markdownOutput);

  return PLATFORMS.map((platform): SocialPostPreview => {
    const rules = PLATFORM_RULES[platform];
    const text = channelTexts[platform] || "";
    const hashtags = extractHashtags(text);
    const link = extractFirstLink(text);
    const charCount = computeCharCount(text) as number;
    const mediaForPlatform = media ?? null;
    const cropGuidance = assessCropGuidance(mediaForPlatform, platform);

    const warnings: string[] = [...rules.staticWarnings];

    // Character count warnings
    if (charCount > rules.charLimit) {
      if (rules.charLimitHard) {
        warnings.push(
          `Over ${rules.charLimit}-character limit (${charCount} chars). Post will be truncated.`
        );
      } else {
        warnings.push(
          `${charCount} chars exceeds soft limit of ${rules.charLimit}. Consider shortening.`
        );
      }
    } else if (charCount === 0) {
      warnings.push("No content for this platform — the distributor may not have generated an output.");
    }

    // Crop warnings
    if (mediaForPlatform && cropGuidance.likelyCropped) {
      warnings.push(cropGuidance.safeAreaNote);
    } else if (mediaForPlatform && !mediaForPlatform.width) {
      warnings.push(cropGuidance.safeAreaNote);
    }

    // Platform-specific link warning (Instagram)
    if (platform === "instagram" && link) {
      // Already added via staticWarnings — add specifics
      warnings.push(`Link found in caption: "${link}" — not clickable on Instagram.`);
    }

    return {
      platform,
      text,
      hashtags,
      link,
      media: mediaForPlatform,
      metadata: {
        charCount,
        charLimit: rules.charLimit,
        charLimitHard: rules.charLimitHard,
        warnings,
        cropGuidance,
      },
    };
  });
}

// ── Internal helpers ──────────────────────────────────────────────────────────

interface SubSection {
  heading: string;
  content: string;
}

/** Split text on ### headings or **Bold:** markers. */
function splitOnH3OrBold(text: string): SubSection[] {
  const sections: SubSection[] = [];

  // Try ### headings
  if (/^###\s/m.test(text)) {
    const parts = text.split(/\n(?=###\s)/);
    for (const part of parts) {
      const m = part.match(/^###\s+(.+)\n?([\s\S]*)$/);
      if (m) sections.push({ heading: m[1].trim(), content: m[2].trim() });
    }
    return sections;
  }

  // Try **Bold heading:** pattern
  const boldRe = /\*\*([^*]+?):\*\*\s*\n([\s\S]*?)(?=\*\*[^*]+?:\*\*|$)/g;
  let m: RegExpExecArray | null;
  while ((m = boldRe.exec(text)) !== null) {
    sections.push({ heading: m[1].trim(), content: m[2].trim() });
  }

  return sections;
}

/** Map a heading string to a SocialPlatform by keyword matching. */
function matchPlatform(heading: string): SocialPlatform | null {
  const h = heading.toLowerCase();
  if (/\bx\b|twitter|tweet/.test(h)) return "x";
  if (/linkedin/.test(h)) return "linkedin";
  if (/instagram|ig\b|insta/.test(h)) return "instagram";
  return null;
}
