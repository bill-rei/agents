import type { UCSCanonical, UCSOverrides, UCSBrandMode } from "../schema";
import { getBrandRules } from "../../brandRules";

const MAX_CHARS = 2200;

export function renderInstagram(
  canonical: UCSCanonical,
  overrides: UCSOverrides["instagram"] | undefined,
  brandMode: UCSBrandMode
): string {
  const rules = getBrandRules(brandMode);

  const hook = overrides?.hook ?? canonical.hook;
  const body = overrides?.body ?? canonical.body;
  const cta = overrides?.callToAction ?? canonical.callToAction;
  const rawTags = overrides?.hashtags ?? canonical.hashtags ?? [];
  const hashtags = rawTags
    .slice(0, rules.maxHashtags.instagram)
    .map((h) => (h.startsWith("#") ? h : `#${h}`))
    .join(" ");

  // Instagram style: hook → blank line → body → blank line → CTA → divider → hashtags
  const parts: string[] = [hook, "", body];
  if (cta) parts.push("", cta);
  if (hashtags) parts.push("", ".", "", hashtags);

  return parts.join("\n").slice(0, MAX_CHARS);
}
