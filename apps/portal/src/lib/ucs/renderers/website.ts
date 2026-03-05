import type { UCSCanonical, UCSOverrides, UCSBrandMode } from "../schema";
import { getBrandRules } from "../../brandRules";

export function renderWebsite(
  canonical: UCSCanonical,
  overrides: UCSOverrides["website"] | undefined,
  brandMode: UCSBrandMode,
  title: string
): string {
  const rules = getBrandRules(brandMode);
  const today = new Date().toISOString().slice(0, 10);

  const slug = overrides?.slug ?? slugify(title);
  const metaDescription =
    overrides?.metaDescription ?? canonical.body.slice(0, 155).replace(/\n/g, " ");
  const featuredImage = overrides?.featuredImageRef ?? canonical.mediaRefs?.[0]?.ref ?? "";
  const body = overrides?.body ?? buildMarkdownBody(canonical, rules.privacyStatement);

  const frontMatter = [
    "---",
    `title: "${title.replace(/"/g, '\\"')}"`,
    `slug: "${slug}"`,
    `brand: ${brandMode}`,
    `date: ${today}`,
    `description: "${metaDescription.replace(/"/g, '\\"')}"`,
    featuredImage ? `featuredImage: "${featuredImage}"` : null,
    `status: draft`,
    "---",
  ]
    .filter((l) => l !== null)
    .join("\n");

  return `${frontMatter}\n\n${body}`;
}

function buildMarkdownBody(canonical: UCSCanonical, privacyStatement?: string): string {
  const parts: string[] = [`# ${canonical.hook}`, "", canonical.body];

  if (canonical.links?.length) {
    parts.push("");
    for (const link of canonical.links) {
      parts.push(`[${link.label}](${link.url})`);
    }
  }

  if (canonical.callToAction) {
    parts.push("", `**${canonical.callToAction}**`);
  }

  if (privacyStatement) {
    parts.push("", "---", "", `*${privacyStatement}*`);
  }

  return parts.join("\n");
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
}
