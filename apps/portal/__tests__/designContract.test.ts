import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateDesignContract } from "../src/lib/designContract/validate";
import { buildFallbackHtml } from "../src/lib/wp/publishDesignLockedPage";
import type { DesignContract } from "../src/lib/designContract/schema";

// ── Helper: minimal valid artifact ──

function validArtifact(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    meta: {
      brand: "llif",
      campaign_type: "use_case",
      version: "1.0.0",
      last_updated: "2026-02-18",
    },
    hero: { title: "Hero Title" },
    tldr: { summary: "A brief summary of this campaign." },
    sections: [
      { heading: "Section One", body: "This is the body text." },
    ],
    privacy_block: { enabled: true, text: "We respect your privacy." },
    cta: {
      headline: "Get Started",
      button_text: "Learn More",
      button_url: "https://example.com/start",
    },
    ...overrides,
  };
}

// ── Schema validation ──

describe("validateDesignContract", () => {
  it("accepts a valid LLIF artifact", () => {
    const result = validateDesignContract(validArtifact());
    assert.ok(result.ok, `Expected ok, got errors: ${result.errors.join(", ")}`);
    assert.ok(result.data);
    assert.strictEqual(result.data.meta.brand, "llif");
  });

  it("accepts a valid BestLife artifact (no privacy required)", () => {
    const result = validateDesignContract(
      validArtifact({
        meta: {
          brand: "bestlife",
          campaign_type: "feature",
          version: "1.0.0",
          last_updated: "2026-01-01",
        },
        privacy_block: undefined,
      })
    );
    assert.ok(result.ok, `Errors: ${result.errors.join(", ")}`);
  });

  it("rejects unknown brand", () => {
    const result = validateDesignContract(
      validArtifact({ meta: { brand: "unknown", campaign_type: "use_case", version: "1", last_updated: "2026-01-01" } })
    );
    assert.ok(!result.ok);
    assert.ok(result.errors.some((e) => e.includes("brand")));
  });

  it("rejects unknown campaign_type", () => {
    const result = validateDesignContract(
      validArtifact({ meta: { brand: "llif", campaign_type: "webinar", version: "1", last_updated: "2026-01-01" } })
    );
    assert.ok(!result.ok);
    assert.ok(result.errors.some((e) => e.includes("campaign_type")));
  });

  it("rejects invalid last_updated format", () => {
    const result = validateDesignContract(
      validArtifact({ meta: { brand: "llif", campaign_type: "use_case", version: "1", last_updated: "02/18/2026" } })
    );
    assert.ok(!result.ok);
    assert.ok(result.errors.some((e) => e.includes("YYYY-MM-DD")));
  });
});

// ── LLIF privacy requirement ──

describe("LLIF privacy requirement", () => {
  it("rejects LLIF without privacy_block", () => {
    const result = validateDesignContract(validArtifact({ privacy_block: undefined }));
    assert.ok(!result.ok);
    assert.ok(result.errors.some((e) => e.includes("privacy_block.enabled")));
  });

  it("rejects LLIF with privacy_block.enabled=false", () => {
    const result = validateDesignContract(
      validArtifact({ privacy_block: { enabled: false } })
    );
    assert.ok(!result.ok);
    assert.ok(result.errors.some((e) => e.includes("privacy_block.enabled")));
  });

  it("rejects LLIF with privacy enabled but no text", () => {
    const result = validateDesignContract(
      validArtifact({ privacy_block: { enabled: true, text: "" } })
    );
    assert.ok(!result.ok);
    assert.ok(result.errors.some((e) => e.includes("privacy_block.text")));
  });
});

// ── Section limits ──

describe("section limits", () => {
  it("rejects more than 6 sections", () => {
    const sections = Array.from({ length: 7 }, (_, i) => ({
      heading: `Section ${i + 1}`,
      body: "Short body.",
    }));
    const result = validateDesignContract(validArtifact({ sections }));
    assert.ok(!result.ok);
    assert.ok(result.errors.some((e) => e.includes("sections")));
  });

  it("accepts exactly 6 sections", () => {
    const sections = Array.from({ length: 6 }, (_, i) => ({
      heading: `Section ${i + 1}`,
      body: "Short body.",
    }));
    const result = validateDesignContract(validArtifact({ sections }));
    assert.ok(result.ok, `Errors: ${result.errors.join(", ")}`);
  });

  it("rejects empty sections array", () => {
    const result = validateDesignContract(validArtifact({ sections: [] }));
    assert.ok(!result.ok);
  });
});

// ── Body word count ──

describe("body word count limit", () => {
  it("rejects body with > 120 words", () => {
    const longBody = Array(121).fill("word").join(" ");
    const result = validateDesignContract(
      validArtifact({
        sections: [{ heading: "Test", body: longBody }],
      })
    );
    assert.ok(!result.ok);
    assert.ok(result.errors.some((e) => e.includes("120-word")));
  });

  it("accepts body with exactly 120 words", () => {
    const body = Array(120).fill("word").join(" ");
    const result = validateDesignContract(
      validArtifact({
        sections: [{ heading: "Test", body }],
      })
    );
    assert.ok(result.ok, `Errors: ${result.errors.join(", ")}`);
  });
});

// ── H1 enforcement ──

describe("H1 enforcement", () => {
  it("rejects H1 tags in section body", () => {
    const result = validateDesignContract(
      validArtifact({
        sections: [{ heading: "Test", body: "<h1>Nope</h1> some text" }],
      })
    );
    assert.ok(!result.ok);
    assert.ok(result.errors.some((e) => e.includes("<h1>")));
  });

  it("rejects H1 in tldr summary", () => {
    const result = validateDesignContract(
      validArtifact({ tldr: { summary: "<h1>Big</h1>" } })
    );
    assert.ok(!result.ok);
    assert.ok(result.errors.some((e) => e.includes("<h1>")));
  });
});

// ── CTA URL validation ──

describe("CTA URL validation", () => {
  it("rejects non-HTTPS URL", () => {
    const result = validateDesignContract(
      validArtifact({
        cta: { headline: "Go", button_text: "Click", button_url: "http://example.com" },
      })
    );
    assert.ok(!result.ok);
    assert.ok(result.errors.some((e) => e.toLowerCase().includes("https")));
  });

  it("rejects invalid URL", () => {
    const result = validateDesignContract(
      validArtifact({
        cta: { headline: "Go", button_text: "Click", button_url: "not-a-url" },
      })
    );
    assert.ok(!result.ok);
  });
});

// ── Sanitization ──

describe("sanitization", () => {
  it("rejects inline styles in body", () => {
    const result = validateDesignContract(
      validArtifact({
        sections: [{ heading: "Test", body: '<p style="color:red">text</p>' }],
      })
    );
    assert.ok(!result.ok);
    assert.ok(result.errors.some((e) => e.includes("inline style")));
  });

  it("rejects script tags in body", () => {
    const result = validateDesignContract(
      validArtifact({
        sections: [{ heading: "Test", body: "<script>alert(1)</script>" }],
      })
    );
    assert.ok(!result.ok);
    assert.ok(result.errors.some((e) => e.includes("<script>")));
  });

  it("rejects event handlers", () => {
    const result = validateDesignContract(
      validArtifact({
        sections: [{ heading: "Test", body: '<p onclick="evil()">click me</p>' }],
      })
    );
    assert.ok(!result.ok);
    assert.ok(result.errors.some((e) => e.includes("event handler")));
  });
});

// ── Fallback HTML ──

describe("buildFallbackHtml", () => {
  it("produces valid HTML with hero as H1", () => {
    const data: DesignContract = {
      meta: { brand: "llif", campaign_type: "use_case", version: "1.0.0", last_updated: "2026-02-18" },
      hero: { title: "My Page", subtitle: "Sub", eyebrow: "Eye" },
      tldr: { summary: "Summary here." },
      sections: [
        { heading: "Sec 1", body: "Body text", bullets: ["Bullet A", "Bullet B"] },
      ],
      privacy_block: { enabled: true, text: "Privacy info." },
      cta: { headline: "CTA Title", button_text: "Go", button_url: "https://example.com" },
    };
    const html = buildFallbackHtml(data);

    assert.ok(html.includes("<h1>My Page</h1>"));
    assert.ok(html.includes("<h2>TL;DR</h2>"));
    assert.ok(html.includes("<h2>Sec 1</h2>"));
    assert.ok(html.includes("<li>Bullet A</li>"));
    assert.ok(html.includes("<h2>Privacy</h2>"));
    assert.ok(html.includes('href="https://example.com"'));
    // No inline styles
    assert.ok(!html.includes("style="));
  });

  it("escapes HTML entities in content", () => {
    const data: DesignContract = {
      meta: { brand: "bestlife", campaign_type: "feature", version: "1", last_updated: "2026-01-01" },
      hero: { title: "A <script> test & more" },
      tldr: { summary: "Safe." },
      sections: [{ heading: "S", body: "B" }],
      cta: { headline: "CTA", button_text: "Go", button_url: "https://x.com" },
    };
    const html = buildFallbackHtml(data);
    assert.ok(html.includes("&lt;script&gt;"));
    assert.ok(html.includes("&amp;"));
  });
});
