/**
 * Reddit content policy guard.
 *
 * Blocks all Reddit artifacts unless they pass strict anti-promotional
 * rules. No actual Reddit API posting is implemented — this module only
 * validates that content is safe to post.
 *
 * Returns { allowed: true } or { allowed: false, reasons: string[] }.
 */

const { validateArtifact } = require("../../marketing-artifacts");

// ── Pattern lists ──

const CTA_PHRASES = [
  "check out",
  "sign up",
  "subscribe",
  "download",
  "buy now",
  "order now",
  "get started",
  "join now",
  "click here",
  "learn more at",
  "visit our",
  "visit us",
  "try it free",
  "free trial",
  "use code",
  "use coupon",
  "promo code",
  "discount code",
  "limited time",
  "act now",
  "don't miss",
  "shop now",
  "grab your",
  "claim your",
];

const LINK_PATTERN = /https?:\/\/[^\s]+/i;

// Brand mention is "excessive" if the brand name appears 2+ times in the body
const MAX_BRAND_MENTIONS = 1;

// ── Guard logic ──

/**
 * Check a Reddit artifact against content policy rules.
 *
 * @param {object} artifact - A validated marketing artifact
 * @returns {{ allowed: true } | { allowed: false, reasons: string[] }}
 */
function checkRedditPolicy(artifact) {
  const reasons = [];

  // Gate 1: must be a social_post targeting reddit
  if (!artifact || artifact.artifact_type !== "social_post") {
    reasons.push("Not a social_post artifact");
    return { allowed: false, reasons };
  }
  if (artifact.target?.platform !== "reddit") {
    reasons.push("Not a Reddit artifact");
    return { allowed: false, reasons };
  }

  // Gate 2: schema validation (collect errors but continue to content rules)
  const validation = validateArtifact(artifact);
  if (!validation.valid) {
    reasons.push(...validation.errors);
  }

  // Gate 3: only "discussion" mode is allowed
  const mode = artifact.target.reddit_mode;
  if (mode !== "discussion") {
    reasons.push(
      `reddit_mode must be "discussion" to pass content policy (got: "${mode || "unset"}"). ` +
      'Only discussion-style posts are permitted.'
    );
    return { allowed: false, reasons };
  }

  // Gate 4: content rules (all checked, not short-circuited)
  const body = (artifact.content?.body || "").toLowerCase();
  const brand = (artifact.brand || "").toLowerCase();

  // 4a: No CTA field
  if (artifact.content?.cta) {
    reasons.push("content.cta field is set — Reddit posts must not contain calls to action");
  }

  // 4b: No CTA phrases in body
  for (const phrase of CTA_PHRASES) {
    if (body.includes(phrase)) {
      reasons.push(`Body contains promotional phrase: "${phrase}"`);
    }
  }

  // 4c: No links in body
  const linkMatch = (artifact.content?.body || "").match(LINK_PATTERN);
  if (linkMatch) {
    reasons.push(`Body contains a link: "${linkMatch[0]}" — Reddit discussion posts should not include links`);
  }

  // 4d: No media_urls (links by another name)
  if (artifact.content?.media_urls && artifact.content.media_urls.length > 0) {
    reasons.push("content.media_urls is set — Reddit discussion posts should not include media links");
  }

  // 4e: Minimal brand mention (at most 1)
  if (brand && brand.length >= 2) {
    const brandRegex = new RegExp(escapeRegex(brand), "gi");
    const mentions = (artifact.content?.body || "").match(brandRegex);
    if (mentions && mentions.length > MAX_BRAND_MENTIONS) {
      reasons.push(
        `Body mentions brand "${artifact.brand}" ${mentions.length} times (max ${MAX_BRAND_MENTIONS}). ` +
        "Reduce brand mentions for authentic discussion."
      );
    }
  }

  // 4f: No hashtags (Reddit doesn't use them, looks promotional)
  if (artifact.content?.hashtags && artifact.content.hashtags.length > 0) {
    reasons.push("content.hashtags is set — Reddit does not use hashtags; this looks promotional");
  }

  // Gate 5: must end with a question prompt
  const bodyTrimmed = (artifact.content?.body || "").trim();
  if (!bodyTrimmed.endsWith("?")) {
    reasons.push(
      'Body must end with a question to prompt discussion (e.g. "What has worked for you?")'
    );
  }

  return reasons.length > 0
    ? { allowed: false, reasons }
    : { allowed: true };
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Publish-pipeline entry point. Matches the adapter interface.
 *
 * For Reddit, "publishing" means running the content guard.
 * If the guard passes, it returns a success status indicating the
 * content is safe but no actual posting occurred.
 *
 * @param {object} artifact
 * @param {object} opts  - { dryRun: boolean }
 * @returns {Promise<{ status: string, reasons?: string[] }>}
 */
async function publish(artifact, opts = {}) {
  const { dryRun = false } = opts;

  const result = checkRedditPolicy(artifact);

  if (!result.allowed) {
    const label = dryRun ? "[dry-run] " : "";
    console.log(`  ${label}BLOCKED — Reddit content policy violation(s):`);
    for (const r of result.reasons) console.log(`    - ${r}`);
    return { status: "BLOCKED", reasons: result.reasons };
  }

  if (dryRun) {
    console.log("  [dry-run] Reddit content policy: PASSED");
    console.log("  [dry-run] No Reddit API adapter implemented — post would need manual submission");
    return { status: "dry-run" };
  }

  console.log("  Reddit content policy: PASSED");
  console.log("  No Reddit API adapter implemented — post needs manual submission");
  return { status: "policy-passed" };
}

module.exports = { checkRedditPolicy, publish };
