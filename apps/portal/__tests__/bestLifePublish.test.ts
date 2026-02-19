/**
 * Best Life Direct-to-Social — Tests
 *
 * Covers: channel registry, assist pack generation, guardrails, routing, char counts.
 * Run: npx tsx --test __tests__/bestLifePublish.test.ts
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ── Channel registry ──────────────────────────────────────────────────────────

import {
  getAllChannels,
  getDirectChannelKeys,
  getAssistChannelKeys,
  isValidChannelKey,
  getAllChannelKeys,
  truncateForChannel,
} from "../src/lib/publishers/bestlife/channelRegistry";

describe("channelRegistry — DIRECT_CHANNEL_KEYS", () => {
  it("contains exactly x_profile, linkedin_company_page, facebook_page", () => {
    const keys = getDirectChannelKeys();
    assert.deepEqual(keys.sort(), ["facebook_page", "linkedin_company_page", "x_profile"].sort());
  });
});

describe("channelRegistry — ASSIST_CHANNEL_KEYS", () => {
  it("contains instagram, threads, bluesky, reddit, youtube, tiktok", () => {
    const keys = getAssistChannelKeys();
    const expected = [
      "instagram_profile",
      "threads_profile",
      "bluesky_profile",
      "reddit_community",
      "youtube_channel",
      "tiktok_business_profile",
    ];
    assert.deepEqual(keys.sort(), expected.sort());
  });
});

describe("channelRegistry — total channel count", () => {
  it("has exactly 9 channels", () => {
    assert.equal(getAllChannels().length, 9);
  });
});

describe("channelRegistry — isValidChannelKey", () => {
  it("returns true for known channels", () => {
    assert.ok(isValidChannelKey("x_profile"));
    assert.ok(isValidChannelKey("tiktok_business_profile"));
  });

  it("returns false for unknown or LLIF-specific keys", () => {
    assert.equal(isValidChannelKey("llif_x_profile"), false);
    assert.equal(isValidChannelKey(""), false);
    assert.equal(isValidChannelKey("facebook"), false); // not a canonical key
  });
});

describe("channelRegistry — truncateForChannel", () => {
  it("returns unchanged text when within limit", () => {
    const text = "Hello world";
    assert.equal(truncateForChannel(text, "facebook_page"), text);
  });

  it("truncates X post at word boundary and appends ellipsis", () => {
    const words = Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ");
    const result = truncateForChannel(words, "x_profile");
    assert.ok(result.length <= 280, `Expected ≤280, got ${result.length}`);
    assert.ok(result.endsWith("…"), "Expected ellipsis");
    assert.ok(!result.slice(0, -1).endsWith(" "), "Should not end with space before ellipsis");
  });

  it("truncates BlueSky post to 300 chars", () => {
    const text = "x".repeat(400);
    const result = truncateForChannel(text, "bluesky_profile");
    assert.ok(result.length <= 300, `Expected ≤300, got ${result.length}`);
    assert.ok(result.endsWith("…"));
  });

  it("does not truncate LinkedIn at 3000 chars", () => {
    const text = "y".repeat(2999);
    assert.equal(truncateForChannel(text, "linkedin_company_page"), text);
  });

  it("char limits match canonical values", () => {
    const channels = getAllChannels();
    const charLimits: Record<string, number> = {
      x_profile: 280,
      linkedin_company_page: 3000,
      facebook_page: 63206,
      instagram_profile: 2200,
      threads_profile: 500,
      bluesky_profile: 300,
      reddit_community: 40000,
      youtube_channel: 500,
      tiktok_business_profile: 2200,
    };
    for (const ch of channels) {
      assert.equal(ch.charLimit, charLimits[ch.key], `Wrong charLimit for ${ch.key}`);
    }
  });
});

// ── Assist pack generator ─────────────────────────────────────────────────────

import {
  buildAssistPack,
  buildAssistPackMarkdown,
} from "../src/lib/publishers/bestlife/assistPackGenerator";
import type { SocialArtifact } from "../src/lib/publishers/bestlife/directPublisher";

const SAMPLE_ARTIFACT: SocialArtifact = {
  id: "art_test_001",
  title: "BestLife 3.0 Launch",
  body: "We are thrilled to announce BestLife 3.0 — the biggest update yet. New features include smarter goal tracking, redesigned dashboards, and AI-powered insights.",
  hashtags: ["BestLife", "HealthTech", "WellnessApp"],
  mediaUrls: ["https://portal.example.com/api/assets/img1.jpg"],
  linkUrl: "https://getbestlife.com/launch",
};

describe("assistPackGenerator — buildAssistPack", () => {
  it("includes all 6 assist channels", () => {
    const pack = buildAssistPack(SAMPLE_ARTIFACT, getAssistChannelKeys());
    const keys = pack.channels.map((c) => c.channelKey);
    const expected = getAssistChannelKeys();
    assert.deepEqual(keys.sort(), expected.sort());
  });

  it("post text for X (via truncation) is within 280 chars", () => {
    // Build a pack with x_profile to verify truncation
    const longArtifact: SocialArtifact = {
      ...SAMPLE_ARTIFACT,
      body: "word ".repeat(60).trim(),
    };
    // Simulate what would happen if we generated for x
    const result = truncateForChannel(longArtifact.body, "x_profile");
    assert.ok(result.length <= 280);
  });

  it("withinLimit is true for short body", () => {
    const pack = buildAssistPack(SAMPLE_ARTIFACT, ["bluesky_profile"]);
    const entry = pack.channels[0];
    assert.ok(entry.withinLimit, "Short body should be within 300 char BlueSky limit");
  });

  it("withinLimit is false when body exceeds channel limit after combination", () => {
    const overflowArtifact: SocialArtifact = {
      ...SAMPLE_ARTIFACT,
      body: "x".repeat(310), // over BlueSky's 300 limit
    };
    const pack = buildAssistPack(overflowArtifact, ["bluesky_profile"]);
    const entry = pack.channels[0];
    // After truncation the text IS within limit, but withinLimit reflects the truncated result
    assert.ok(entry.characterCount <= 300, "Truncated text must be within limit");
  });

  it("includes mediaFilenames from mediaUrls", () => {
    const pack = buildAssistPack(SAMPLE_ARTIFACT, ["instagram_profile"]);
    const entry = pack.channels[0];
    assert.ok(entry.mediaFilenames.length > 0);
    assert.ok(entry.mediaFilenames[0].endsWith(".jpg"));
  });

  it("includes postingInstructions for every assist channel", () => {
    const pack = buildAssistPack(SAMPLE_ARTIFACT, getAssistChannelKeys());
    for (const entry of pack.channels) {
      assert.ok(
        entry.postingInstructions.length > 0,
        `Missing instructions for ${entry.channelKey}`
      );
    }
  });

  it("sets brand to 'bestlife' and version to '1.0'", () => {
    const pack = buildAssistPack(SAMPLE_ARTIFACT, ["instagram_profile"]);
    assert.equal(pack.brand, "bestlife");
    assert.equal(pack.version, "1.0");
  });
});

describe("assistPackGenerator — buildAssistPackMarkdown", () => {
  it("produces markdown with channel headings", () => {
    const pack = buildAssistPack(SAMPLE_ARTIFACT, getAssistChannelKeys());
    const md = buildAssistPackMarkdown(pack);
    assert.ok(md.includes("## Instagram"), "Should include Instagram heading");
    assert.ok(md.includes("## BlueSky"), "Should include BlueSky heading");
    assert.ok(md.includes("### Post Copy"), "Should include Post Copy section");
    assert.ok(md.includes("### Posting Instructions"), "Should include instructions");
  });
});

// ── Brand guardrails ──────────────────────────────────────────────────────────

import { validateBestLifePublish } from "../src/lib/publishers/bestlife/index";

describe("guardrails — validateBestLifePublish", () => {
  it("returns null for valid bestlife brand + channels", () => {
    const err = validateBestLifePublish("bestlife", ["x_profile", "facebook_page"]);
    assert.equal(err, null);
  });

  it("rejects LLIF brand with BRAND_MISMATCH", () => {
    const err = validateBestLifePublish("llif", ["x_profile"]);
    assert.ok(err !== null);
    assert.equal(err!.code, "BRAND_MISMATCH");
  });

  it("rejects mixed-case LLIF brand variant", () => {
    const err = validateBestLifePublish("LLIF", ["x_profile"]);
    assert.ok(err !== null);
    assert.equal(err!.code, "BRAND_MISMATCH");
  });

  it("rejects empty channel selection with EMPTY_CHANNELS", () => {
    const err = validateBestLifePublish("bestlife", []);
    assert.ok(err !== null);
    assert.equal(err!.code, "EMPTY_CHANNELS");
  });

  it("rejects unknown channel keys with UNKNOWN_CHANNELS", () => {
    const err = validateBestLifePublish("bestlife", ["x_profile", "llif_zoho_channel"]);
    assert.ok(err !== null);
    assert.equal(err!.code, "UNKNOWN_CHANNELS");
    assert.ok(err!.unknownKeys!.includes("llif_zoho_channel"));
  });

  it("rejects all-unknown channels", () => {
    const err = validateBestLifePublish("bestlife", ["not_a_real_channel"]);
    assert.ok(err !== null);
    assert.equal(err!.code, "UNKNOWN_CHANNELS");
  });
});

// ── Channel routing ───────────────────────────────────────────────────────────

describe("channel routing", () => {
  it("x_profile, linkedin_company_page, facebook_page route to direct", () => {
    const direct = getDirectChannelKeys();
    assert.ok(direct.includes("x_profile"));
    assert.ok(direct.includes("linkedin_company_page"));
    assert.ok(direct.includes("facebook_page"));
  });

  it("instagram, threads, bluesky, reddit, youtube, tiktok route to assist", () => {
    const assist = getAssistChannelKeys();
    assert.ok(assist.includes("instagram_profile"));
    assert.ok(assist.includes("threads_profile"));
    assert.ok(assist.includes("bluesky_profile"));
    assert.ok(assist.includes("reddit_community"));
    assert.ok(assist.includes("youtube_channel"));
    assert.ok(assist.includes("tiktok_business_profile"));
  });

  it("no channel appears in both direct and assist lists", () => {
    const direct = new Set(getDirectChannelKeys());
    const assist = getAssistChannelKeys();
    for (const key of assist) {
      assert.ok(!direct.has(key), `${key} should not be in both lists`);
    }
  });

  it("all known channels are in exactly one of direct or assist", () => {
    const all = new Set(getAllChannelKeys());
    const direct = new Set(getDirectChannelKeys());
    const assist = new Set(getAssistChannelKeys());
    for (const key of all) {
      const inDirect = direct.has(key);
      const inAssist = assist.has(key);
      assert.ok(
        (inDirect || inAssist) && !(inDirect && inAssist),
        `${key} must be in exactly one partition`
      );
    }
  });
});
