import type { UCSCanonical, UCSOverrides, UCSBrandMode } from "../schema";
import { getBrandRules } from "../../brandRules";

const MAX_CHARS = 3000;

export function renderLinkedIn(
  canonical: UCSCanonical,
  overrides: UCSOverrides["linkedin"] | undefined,
  brandMode: UCSBrandMode
): string {
  const rules = getBrandRules(brandMode);

  const hook = overrides?.hook ?? canonical.hook;
  const body = overrides?.body ?? canonical.body;
  const cta = overrides?.callToAction ?? canonical.callToAction ?? rules.ctaStyle;
  const rawTags = overrides?.hashtags ?? canonical.hashtags ?? [];
  const hashtags = rawTags
    .slice(0, rules.maxHashtags.linkedin)
    .map((h) => (h.startsWith("#") ? h : `#${h}`))
    .join(" ");

  const parts: string[] = [hook, "", body, "", cta];
  if (hashtags) parts.push("", hashtags);

  return parts.join("\n").slice(0, MAX_CHARS);
}
