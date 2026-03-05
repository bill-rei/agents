import type { UCSCanonical, UCSOverrides, UCSBrandMode } from "../schema";
import { getBrandRules } from "../../brandRules";

const MAX_CHARS = 280;

export function renderX(
  canonical: UCSCanonical,
  overrides: UCSOverrides["x"] | undefined,
  brandMode: UCSBrandMode
): string {
  const rules = getBrandRules(brandMode);

  const hook = overrides?.hook ?? canonical.hook;
  const cta = overrides?.callToAction ?? canonical.callToAction;
  const rawTags = overrides?.hashtags ?? canonical.hashtags ?? [];
  const hashtags = rawTags
    .slice(0, rules.maxHashtags.x)
    .map((h) => (h.startsWith("#") ? h : `#${h}`))
    .join(" ");

  // Build tweet — hook first, then hashtags, then optional CTA link
  // Keep within 280 chars
  const suffix = [hashtags, cta].filter(Boolean).join(" ");
  const budget = MAX_CHARS - (suffix ? suffix.length + 1 : 0);
  const trimmedHook = hook.length <= budget ? hook : hook.slice(0, budget - 1) + "…";

  return [trimmedHook, suffix].filter(Boolean).join(" ").slice(0, MAX_CHARS);
}
