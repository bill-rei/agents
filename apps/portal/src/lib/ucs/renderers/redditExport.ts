import type { UCSCanonical, UCSOverrides, UCSBrandMode } from "../schema";

export interface RedditExport {
  subreddit: string;
  title: string;
  body: string;
  firstComment: string;
}

export function renderRedditExport(
  canonical: UCSCanonical,
  overrides: UCSOverrides["reddit"] | undefined,
  brandMode: UCSBrandMode
): RedditExport {
  const subreddit = overrides?.subreddit ?? "longevity";
  const title = overrides?.title ?? canonical.hook;
  const body = overrides?.body ?? buildRedditBody(canonical);

  // First comment: CTA + links (common Reddit practice for self-posts)
  let firstComment = overrides?.firstComment ?? "";
  if (!firstComment) {
    const lines: string[] = [];
    if (canonical.callToAction) lines.push(canonical.callToAction);
    if (canonical.links?.length) {
      lines.push("");
      lines.push("**Links:**");
      for (const link of canonical.links) {
        lines.push(`- [${link.label}](${link.url})`);
      }
    }
    firstComment = lines.join("\n");
  }

  return { subreddit, title, body, firstComment };
}

function buildRedditBody(canonical: UCSCanonical): string {
  const parts: string[] = [canonical.body];
  if (canonical.hashtags?.length) {
    parts.push("");
    parts.push(`*Tags: ${canonical.hashtags.join(", ")}*`);
  }
  return parts.join("\n");
}
