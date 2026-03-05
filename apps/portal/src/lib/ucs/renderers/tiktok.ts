import type { UCSCanonical, UCSOverrides, UCSBrandMode } from "../schema";
import { getBrandRules } from "../../brandRules";

const MAX_CHARS = 2200;

export function renderTikTok(
  canonical: UCSCanonical,
  overrides: UCSOverrides["tiktok"] | undefined,
  brandMode: UCSBrandMode
): string {
  const rules = getBrandRules(brandMode);

  const hook = overrides?.hook ?? canonical.hook;
  const body = overrides?.body ?? canonical.body;
  const cta = overrides?.callToAction ?? canonical.callToAction;
  const rawTags = overrides?.hashtags ?? canonical.hashtags ?? [];
  const hashtags = rawTags
    .slice(0, rules.maxHashtags.tiktok)
    .map((h) => (h.startsWith("#") ? h : `#${h}`))
    .join(" ");

  // TikTok style: punchy hook → short body → strong CTA → hashtags all on one line
  const bodyShort = body.length > 200 ? body.slice(0, 197) + "…" : body;
  const parts: string[] = [hook, bodyShort];
  if (cta) parts.push(cta);
  if (hashtags) parts.push(hashtags);

  return parts.join("\n").slice(0, MAX_CHARS);
}
