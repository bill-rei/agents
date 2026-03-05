/**
 * Minimal tests for UCS schema validation and channel renderers.
 * Framework: node:test (consistent with all other portal tests).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { CreateUCSSchema, UCSCanonicalSchema, UCSOverridesSchema } from "../src/lib/ucs/schema";
import { validateUCS } from "../src/lib/ucs/validate";
import { renderLinkedIn } from "../src/lib/ucs/renderers/linkedin";
import { renderX } from "../src/lib/ucs/renderers/x";
import { renderWebsite } from "../src/lib/ucs/renderers/website";
import { renderRedditExport } from "../src/lib/ucs/renderers/redditExport";
import { getBrandRules } from "../src/lib/brandRules";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const CANONICAL_LLIF = {
  hook: "Research suggests your sleep score predicts longevity better than BMI.",
  body: "Data indicates that people who optimize their sleep architecture see a 23% improvement in metabolic markers. Studies show this effect compounds over time.",
  callToAction: "Learn more about your sleep data →",
  hashtags: ["longevity", "healthdata", "sleepscience"],
  tone: "research-informed",
  targetAudience: "health-conscious professionals 35–55",
};

const CANONICAL_BESTLIFE = {
  hook: "You can transform your energy levels in just 7 days!",
  body: "Start your morning with these three simple habits and watch your vitality soar. Small changes create big results when you stay consistent.",
  callToAction: "Start your wellness journey today! ✨",
  hashtags: ["wellness", "morningroutine", "bestlife"],
};

// ── Schema validation ─────────────────────────────────────────────────────────

describe("UCS Schema", () => {
  it("accepts a valid LLIF create payload", () => {
    const result = CreateUCSSchema.safeParse({
      brandMode: "LLIF",
      title: "Sleep Score Campaign",
      canonical: CANONICAL_LLIF,
    });
    assert.ok(result.success, "Expected parse to succeed");
  });

  it("accepts a valid BestLife create payload", () => {
    const result = CreateUCSSchema.safeParse({
      brandMode: "BestLife",
      title: "Morning Routine Campaign",
      canonical: CANONICAL_BESTLIFE,
    });
    assert.ok(result.success, "Expected parse to succeed");
  });

  it("rejects an invalid brandMode", () => {
    const result = CreateUCSSchema.safeParse({
      brandMode: "Unknown",
      title: "Test",
      canonical: { hook: "h", body: "b" },
    });
    assert.ok(!result.success, "Expected parse to fail for unknown brand");
  });

  it("rejects missing hook", () => {
    const result = UCSCanonicalSchema.safeParse({ body: "Body only" });
    assert.ok(!result.success, "Expected parse to fail for missing hook");
  });

  it("rejects URLs in links that are not valid", () => {
    const result = UCSCanonicalSchema.safeParse({
      hook: "h",
      body: "b",
      links: [{ label: "Bad link", url: "not-a-url" }],
    });
    assert.ok(!result.success, "Expected parse to fail for invalid URL");
  });

  it("accepts valid overrides structure", () => {
    const result = UCSOverridesSchema.safeParse({
      linkedin: { hook: "LinkedIn-specific hook" },
      reddit: { subreddit: "longevity", firstComment: "See link in profile." },
    });
    assert.ok(result.success, "Expected overrides parse to succeed");
  });
});

// ── Brand rules ───────────────────────────────────────────────────────────────

describe("Brand Rules", () => {
  it("LLIF has avoid terms including 'cure'", () => {
    const rules = getBrandRules("LLIF");
    assert.ok(rules.avoidTerms.includes("cure"));
  });

  it("BestLife avoids clinical jargon", () => {
    const rules = getBrandRules("BestLife");
    assert.ok(rules.avoidTerms.includes("clinical trial"));
  });

  it("LLIF requires research hedges", () => {
    const rules = getBrandRules("LLIF");
    assert.ok(rules.requiredHedges.length > 0);
  });
});

// ── Validation ────────────────────────────────────────────────────────────────

describe("UCS Validation", () => {
  it("passes for valid LLIF canonical with hedges", () => {
    const result = validateUCS(CANONICAL_LLIF, "LLIF");
    assert.ok(result.valid, `Expected valid, got errors: ${result.errors.join(", ")}`);
  });

  it("warns when LLIF content lacks research hedging", () => {
    const noHedge = { hook: "Sleep is good for you.", body: "A".repeat(110) };
    const result = validateUCS(noHedge, "LLIF");
    assert.ok(result.warnings.length > 0, "Expected at least one warning for missing hedge");
  });

  it("warns when avoid terms are used", () => {
    const withCure = { hook: "Cure your insomnia.", body: "cure everything" };
    const result = validateUCS(withCure, "LLIF");
    assert.ok(result.warnings.some((w) => w.includes("cure")));
  });
});

// ── Renderers ─────────────────────────────────────────────────────────────────

describe("LinkedIn Renderer", () => {
  it("renders under 3000 chars", () => {
    const output = renderLinkedIn(CANONICAL_LLIF, undefined, "LLIF");
    assert.ok(output.length <= 3000, `LinkedIn output too long: ${output.length}`);
  });

  it("includes hook and body", () => {
    const output = renderLinkedIn(CANONICAL_LLIF, undefined, "LLIF");
    assert.ok(output.includes(CANONICAL_LLIF.hook));
    assert.ok(output.includes(CANONICAL_LLIF.body));
  });

  it("respects hook override", () => {
    const output = renderLinkedIn(CANONICAL_LLIF, { hook: "Override hook" }, "LLIF");
    assert.ok(output.includes("Override hook"));
    assert.ok(!output.includes(CANONICAL_LLIF.hook));
  });

  it("prefixes hashtags with #", () => {
    const output = renderLinkedIn(CANONICAL_LLIF, undefined, "LLIF");
    assert.ok(output.includes("#longevity"));
  });
});

describe("X Renderer", () => {
  it("renders within 280 chars", () => {
    const output = renderX(CANONICAL_LLIF, undefined, "LLIF");
    assert.ok(output.length <= 280, `X output too long: ${output.length}`);
  });

  it("truncates long hooks with ellipsis", () => {
    const longCanonical = { ...CANONICAL_LLIF, hook: "A".repeat(300) };
    const output = renderX(longCanonical, undefined, "LLIF");
    assert.ok(output.length <= 280);
    assert.ok(output.includes("…"));
  });
});

describe("Website Renderer", () => {
  it("produces valid markdown with front matter", () => {
    const output = renderWebsite(CANONICAL_LLIF, undefined, "LLIF", "Sleep Score Campaign");
    assert.ok(output.startsWith("---"), "Must start with front matter");
    assert.ok(output.includes("title:"));
    assert.ok(output.includes("brand: LLIF"));
    assert.ok(output.includes("# " + CANONICAL_LLIF.hook));
  });

  it("respects slug override", () => {
    const output = renderWebsite(
      CANONICAL_LLIF,
      { slug: "my-custom-slug" },
      "LLIF",
      "Sleep Score Campaign"
    );
    assert.ok(output.includes('slug: "my-custom-slug"'));
  });

  it("includes privacy statement for LLIF", () => {
    const output = renderWebsite(CANONICAL_LLIF, undefined, "LLIF", "Test");
    assert.ok(output.includes("LLIF never shares"));
  });
});

describe("Reddit Export Renderer", () => {
  it("uses hook as title by default", () => {
    const result = renderRedditExport(CANONICAL_LLIF, undefined, "LLIF");
    assert.strictEqual(result.title, CANONICAL_LLIF.hook);
  });

  it("respects title override", () => {
    const result = renderRedditExport(CANONICAL_LLIF, { title: "Custom Reddit Title" }, "LLIF");
    assert.strictEqual(result.title, "Custom Reddit Title");
  });

  it("includes first comment with CTA link when links provided", () => {
    const withLinks = {
      ...CANONICAL_LLIF,
      links: [{ label: "Learn More", url: "https://llif.com/sleep" }],
    };
    const result = renderRedditExport(withLinks, undefined, "LLIF");
    assert.ok(result.firstComment.includes("https://llif.com/sleep"));
  });
});
