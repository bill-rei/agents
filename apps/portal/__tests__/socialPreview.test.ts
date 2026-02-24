/**
 * Unit tests for Phase 3 Social Preview normalization.
 * Framework: node:test (same pattern as agentOutput.test.ts).
 *
 * Tests cover:
 *  - extractHashtags
 *  - extractFirstLink
 *  - computeCharCount
 *  - assessCropGuidance
 *  - parseDistributorOutputs
 *  - buildPreviewFromDistributorOutput (char-count warnings, crop warnings)
 *  - computeOverall (approval state machine)
 *  - defaultChannels
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  extractHashtags,
  extractFirstLink,
  computeCharCount,
  assessCropGuidance,
  parseDistributorOutputs,
  buildPreviewFromDistributorOutput,
} from "../src/lib/preview/socialPreview";

import {
  computeOverall,
  defaultChannels,
  type ChannelsMap,
  type ChannelApprovalState,
} from "../src/lib/preview/approvalHelper";

import { PLATFORM_RULES } from "../src/lib/preview/platformRules";

// ── extractHashtags ───────────────────────────────────────────────────────────

describe("extractHashtags", () => {
  it("returns empty array when no hashtags", () => {
    assert.deepStrictEqual(extractHashtags("No tags here."), []);
  });

  it("extracts a single hashtag", () => {
    assert.deepStrictEqual(extractHashtags("Hello #world"), ["#world"]);
  });

  it("extracts multiple hashtags", () => {
    const result = extractHashtags("Check #sleep and #health today");
    assert.deepStrictEqual(result, ["#sleep", "#health"]);
  });

  it("deduplicates repeated hashtags", () => {
    const result = extractHashtags("#foo and #foo again");
    assert.deepStrictEqual(result, ["#foo"]);
  });

  it("ignores standalone # with no word following", () => {
    // '#' followed by digit or standalone is excluded by [A-Za-z]\w* rule
    const result = extractHashtags("# just a hash");
    assert.deepStrictEqual(result, []);
  });

  it("handles hashtags at end of sentence with punctuation", () => {
    const result = extractHashtags("Great post #wellness.");
    // regex matches #wellness — the dot is not a word char, so it stops
    assert.ok(result.includes("#wellness"));
  });
});

// ── extractFirstLink ──────────────────────────────────────────────────────────

describe("extractFirstLink", () => {
  it("returns null when no link present", () => {
    assert.strictEqual(extractFirstLink("No link here"), null);
  });

  it("returns the first https URL", () => {
    const result = extractFirstLink("Visit https://example.com for more");
    assert.strictEqual(result, "https://example.com");
  });

  it("returns http URL", () => {
    const result = extractFirstLink("Old http://legacy.com/path");
    assert.strictEqual(result, "http://legacy.com/path");
  });

  it("returns only the first URL when multiple are present", () => {
    const result = extractFirstLink(
      "See https://first.com and https://second.com"
    );
    assert.strictEqual(result, "https://first.com");
  });

  it("stops URL at whitespace", () => {
    const result = extractFirstLink("Go to https://url.com today");
    assert.strictEqual(result, "https://url.com");
  });
});

// ── computeCharCount ──────────────────────────────────────────────────────────

describe("computeCharCount", () => {
  it("returns 0 for empty string", () => {
    assert.strictEqual(computeCharCount(""), 0);
  });

  it("counts characters correctly", () => {
    assert.strictEqual(computeCharCount("Hello!"), 6);
  });

  it("counts emoji as multiple chars (based on string length)", () => {
    // Emoji like 🎉 is 2 chars in JS string length
    const text = "Hi 🎉";
    assert.ok(computeCharCount(text) >= 4);
  });
});

// ── assessCropGuidance ────────────────────────────────────────────────────────

describe("assessCropGuidance", () => {
  it("returns likelyCropped=false when no media", () => {
    const guidance = assessCropGuidance(null, "x");
    assert.strictEqual(guidance.likelyCropped, false);
    assert.ok(guidance.safeAreaNote.includes("No media"));
  });

  it("returns likelyCropped=false when dimensions unknown", () => {
    const guidance = assessCropGuidance({ url: "https://img.com/pic.jpg" }, "x");
    assert.strictEqual(guidance.likelyCropped, false);
    assert.ok(guidance.safeAreaNote.includes("Dimensions unknown"));
  });

  it("does NOT flag crop when aspect ratio matches X recommended (16:9)", () => {
    // 16:9 ≈ 1.778
    const guidance = assessCropGuidance(
      { url: "https://img.com/pic.jpg", width: 1920, height: 1080 },
      "x"
    );
    assert.strictEqual(guidance.likelyCropped, false);
  });

  it("flags crop when aspect ratio is very wrong for X (portrait vs landscape)", () => {
    // 9:16 ≈ 0.5625 — far from X's 16:9 or 1:1
    const guidance = assessCropGuidance(
      { url: "https://img.com/pic.jpg", width: 900, height: 1600 },
      "x"
    );
    assert.strictEqual(guidance.likelyCropped, true);
    assert.ok(guidance.safeAreaNote.includes("cropping likely"));
  });

  it("does NOT flag crop for Instagram 4:5 portrait (0.8)", () => {
    const guidance = assessCropGuidance(
      { url: "https://img.com/pic.jpg", width: 1080, height: 1350 },
      "instagram"
    );
    // 1080/1350 ≈ 0.8 — matches 4:5 exactly
    assert.strictEqual(guidance.likelyCropped, false);
  });

  it("flags crop for 16:9 landscape on Instagram (expects 4:5 portrait)", () => {
    const guidance = assessCropGuidance(
      { url: "https://img.com/pic.jpg", width: 1920, height: 1080 },
      "instagram"
    );
    // 1920/1080 ≈ 1.78 vs Instagram's 4/5 = 0.8 — large diff
    assert.strictEqual(guidance.likelyCropped, true);
  });

  it("includes recommendedAspect string in result", () => {
    const guidance = assessCropGuidance(null, "linkedin");
    assert.strictEqual(guidance.recommendedAspect, PLATFORM_RULES.linkedin.recommendedAspect);
  });
});

// ── parseDistributorOutputs ───────────────────────────────────────────────────

describe("parseDistributorOutputs", () => {
  it("returns empty strings for all platforms when given empty markdown", () => {
    const result = parseDistributorOutputs("");
    assert.strictEqual(result.x, "");
    assert.strictEqual(result.linkedin, "");
    assert.strictEqual(result.instagram, "");
  });

  it("parses ### sub-headings per platform", () => {
    const markdown = `
## Outputs

### X (Twitter)
Check out our new feature! #SleepScore

### LinkedIn
Excited to announce our latest wellness update for professionals.

### Instagram
Sleep better tonight. 🌙 #sleep #wellness
`.trim();

    const result = parseDistributorOutputs(markdown);
    assert.ok(result.x.includes("#SleepScore"), `x: "${result.x}"`);
    assert.ok(result.linkedin.includes("professionals"), `linkedin: "${result.linkedin}"`);
    assert.ok(result.instagram.includes("#sleep"), `instagram: "${result.instagram}"`);
  });

  it("parses **Bold:** markers when no ### headings", () => {
    const markdown = `
## Outputs

**X:**
Tweet content here #health

**LinkedIn:**
LinkedIn post content here.

**Instagram:**
Instagram caption here.
`.trim();

    const result = parseDistributorOutputs(markdown);
    assert.ok(result.x.includes("#health"), `x: "${result.x}"`);
    assert.ok(result.linkedin.includes("LinkedIn post"), `linkedin: "${result.linkedin}"`);
    assert.ok(result.instagram.includes("caption"), `instagram: "${result.instagram}"`);
  });

  it("falls back to full Outputs body when no platform sections found", () => {
    const markdown = `
## Outputs

Generic content for all channels.
`.trim();

    const result = parseDistributorOutputs(markdown);
    // All platforms should get the generic content
    assert.ok(result.x.includes("Generic"), `x should have fallback content`);
    assert.ok(result.linkedin.includes("Generic"), `linkedin should have fallback content`);
    assert.ok(result.instagram.includes("Generic"), `instagram should have fallback content`);
  });

  it("matches 'twitter' heading to x platform", () => {
    const markdown = `
## Outputs

### Twitter Post
Tweet about sleep. #zzz
`.trim();

    const result = parseDistributorOutputs(markdown);
    assert.ok(result.x.includes("#zzz"), `x should be populated from Twitter heading`);
  });
});

// ── buildPreviewFromDistributorOutput ─────────────────────────────────────────

describe("buildPreviewFromDistributorOutput", () => {
  it("returns previews for all 3 platforms", () => {
    const markdown = `
## Outputs

### X (Twitter)
Short tweet. #test

### LinkedIn
LinkedIn post content.

### Instagram
Instagram caption. #ig
`.trim();

    const previews = buildPreviewFromDistributorOutput(markdown);
    assert.strictEqual(previews.length, 3);
    const platforms = previews.map((p) => p.platform);
    assert.ok(platforms.includes("x"));
    assert.ok(platforms.includes("linkedin"));
    assert.ok(platforms.includes("instagram"));
  });

  it("adds hard-limit truncation warning when X post exceeds 280 chars", () => {
    // Build a post that's > 280 chars
    const longText = "A".repeat(290);
    const markdown = `## Outputs\n\n### X (Twitter)\n${longText}`;

    const previews = buildPreviewFromDistributorOutput(markdown);
    const xPreview = previews.find((p) => p.platform === "x")!;
    assert.ok(xPreview.metadata.charCount > 280);
    assert.ok(
      xPreview.metadata.warnings.some((w) => w.includes("280") && w.includes("truncated")),
      `Expected truncation warning. Warnings: ${JSON.stringify(xPreview.metadata.warnings)}`
    );
  });

  it("adds soft-limit warning when LinkedIn post exceeds 3000 chars", () => {
    const longText = "L".repeat(3100);
    const markdown = `## Outputs\n\n### LinkedIn\n${longText}`;

    const previews = buildPreviewFromDistributorOutput(markdown);
    const liPreview = previews.find((p) => p.platform === "linkedin")!;
    assert.ok(liPreview.metadata.charCount > 3000);
    assert.ok(
      liPreview.metadata.warnings.some((w) => w.includes("3000") && w.includes("shortening")),
      `Expected soft limit warning. Warnings: ${JSON.stringify(liPreview.metadata.warnings)}`
    );
    // LinkedIn is soft limit — should NOT say "truncated"
    assert.ok(
      !liPreview.metadata.warnings.some((w) => w.includes("truncated")),
      "LinkedIn should not say truncated"
    );
  });

  it("adds empty content warning when platform has no text", () => {
    // Only supply X content, others empty
    const markdown = `## Outputs\n\n### X (Twitter)\nShort tweet.`;

    const previews = buildPreviewFromDistributorOutput(markdown);
    const liPreview = previews.find((p) => p.platform === "linkedin")!;
    // LinkedIn gets fallback empty or unparsed
    // If it has "no content" warning
    if (liPreview.text === "") {
      assert.ok(
        liPreview.metadata.warnings.some((w) => w.toLowerCase().includes("no content")),
        `Expected no-content warning. Warnings: ${JSON.stringify(liPreview.metadata.warnings)}`
      );
    }
  });

  it("extracts hashtags into the hashtags field", () => {
    const markdown = `## Outputs\n\n### X (Twitter)\nPost about #sleep and #health`;
    const previews = buildPreviewFromDistributorOutput(markdown);
    const xPreview = previews.find((p) => p.platform === "x")!;
    assert.ok(xPreview.hashtags.includes("#sleep"));
    assert.ok(xPreview.hashtags.includes("#health"));
  });

  it("extracts first link into the link field", () => {
    const markdown = `## Outputs\n\n### X (Twitter)\nSee https://example.com for more`;
    const previews = buildPreviewFromDistributorOutput(markdown);
    const xPreview = previews.find((p) => p.platform === "x")!;
    assert.strictEqual(xPreview.link, "https://example.com");
  });

  it("includes Instagram static warning about non-clickable links", () => {
    const markdown = `## Outputs\n\n### Instagram\nGreat post #ig`;
    const previews = buildPreviewFromDistributorOutput(markdown);
    const igPreview = previews.find((p) => p.platform === "instagram")!;
    assert.ok(
      igPreview.metadata.warnings.some((w) => w.toLowerCase().includes("not clickable")),
      `Expected Instagram link warning. Warnings: ${JSON.stringify(igPreview.metadata.warnings)}`
    );
  });

  it("adds crop warning when media aspect is wrong for platform", () => {
    const markdown = `## Outputs\n\n### X (Twitter)\nTweet with image`;
    // 9:16 portrait on X (which wants 16:9 or 1:1)
    const media = { url: "https://img/p.jpg", width: 900, height: 1600 };

    const previews = buildPreviewFromDistributorOutput(markdown, media);
    const xPreview = previews.find((p) => p.platform === "x")!;
    assert.ok(xPreview.metadata.cropGuidance.likelyCropped, "Should detect crop");
    assert.ok(
      xPreview.metadata.warnings.some((w) => w.includes("cropping")),
      `Expected crop warning. Warnings: ${JSON.stringify(xPreview.metadata.warnings)}`
    );
  });

  it("reports charCount accurately", () => {
    const text = "Hello LinkedIn!";
    const markdown = `## Outputs\n\n### LinkedIn\n${text}`;
    const previews = buildPreviewFromDistributorOutput(markdown);
    const liPreview = previews.find((p) => p.platform === "linkedin")!;
    assert.strictEqual(liPreview.metadata.charCount, text.length);
  });
});

// ── computeOverall (approval state machine) ───────────────────────────────────

describe("computeOverall", () => {
  function channels(
    x: ChannelApprovalState["status"],
    linkedin: ChannelApprovalState["status"],
    instagram: ChannelApprovalState["status"]
  ): ChannelsMap {
    const ch = defaultChannels();
    ch.x.status = x;
    ch.linkedin.status = linkedin;
    ch.instagram.status = instagram;
    return ch;
  }

  it("returns 'pending' when all channels are pending", () => {
    assert.strictEqual(computeOverall(channels("pending", "pending", "pending")), "pending");
  });

  it("returns 'approved_all' when all channels are approved", () => {
    assert.strictEqual(computeOverall(channels("approved", "approved", "approved")), "approved_all");
  });

  it("returns 'partial' when some (but not all) are approved", () => {
    assert.strictEqual(computeOverall(channels("approved", "pending", "pending")), "partial");
  });

  it("returns 'needs_changes' when any channel has changes_requested (overrides approved)", () => {
    assert.strictEqual(
      computeOverall(channels("approved", "approved", "changes_requested")),
      "needs_changes"
    );
  });

  it("returns 'needs_changes' when any channel has changes_requested (overrides partial)", () => {
    assert.strictEqual(
      computeOverall(channels("pending", "approved", "changes_requested")),
      "needs_changes"
    );
  });

  it("returns 'needs_changes' when all channels have changes_requested", () => {
    assert.strictEqual(
      computeOverall(channels("changes_requested", "changes_requested", "changes_requested")),
      "needs_changes"
    );
  });

  it("returns 'partial' when x approved and linkedin/instagram pending", () => {
    assert.strictEqual(computeOverall(channels("approved", "pending", "pending")), "partial");
  });
});

// ── defaultChannels ───────────────────────────────────────────────────────────

describe("defaultChannels", () => {
  it("returns channels for all 3 platforms", () => {
    const ch = defaultChannels();
    assert.ok("x" in ch);
    assert.ok("linkedin" in ch);
    assert.ok("instagram" in ch);
  });

  it("all channels default to pending status", () => {
    const ch = defaultChannels();
    assert.strictEqual(ch.x.status, "pending");
    assert.strictEqual(ch.linkedin.status, "pending");
    assert.strictEqual(ch.instagram.status, "pending");
  });

  it("all channels default to null comment, by, at", () => {
    const ch = defaultChannels();
    assert.strictEqual(ch.x.comment, null);
    assert.strictEqual(ch.x.by, null);
    assert.strictEqual(ch.x.at, null);
  });
});
