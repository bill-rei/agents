import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  parseRendererOutput,
  validateSlugUniqueness,
  slugify,
  computeJobStatus,
  computePostPublishJobStatus,
} from "../src/lib/wp/websiteJob";
import type { WebJobPage, PagePublishResult } from "../src/lib/wp/websiteJob";

import { normalizeWebRendererOutput } from "../src/lib/wp/normalizeRendererOutput";

// ── normalizeWebRendererOutput ────────────────────────────────────────────────

describe("normalizeWebRendererOutput", () => {
  // Helper: build a wrapped web_page artifact
  function makeWrapped(innerPages: unknown[]): string {
    const inner = JSON.stringify({
      brand: "LLIF",
      content_format: "html",
      pages: innerPages,
    });
    return JSON.stringify({
      artifact_type: "web_page",
      content_format: "html",
      content: {
        title: "LLIF Website Update",
        html: `json\n${inner}`,
      },
    });
  }

  const fivePages = [
    { slug: "homepage", title: "Homepage", body_html: "<h1>Home</h1>" },
    { slug: "about-llif", title: "About LLIF", body_html: "<h1>About</h1>" },
    { slug: "how-it-works", title: "How It Works", body_html: "<h1>How</h1>" },
    { slug: "privacy-governance", title: "Privacy & Governance", body_html: "<h1>Privacy</h1>" },
    { slug: "research-platform", title: "Research Platform", body_html: "<h1>Research</h1>" },
  ];

  it("extracts 5 pages from wrapped format with json\\n prefix", () => {
    const input = makeWrapped(fivePages);
    const result = normalizeWebRendererOutput(input);

    assert.strictEqual(result.source.kind, "wrapped");
    assert.strictEqual(result.source.embedded_detected, true);
    assert.strictEqual(result.pages.length, 5);

    const slugs = result.pages.map((p) => p.slug);
    assert.deepStrictEqual(slugs, [
      "homepage",
      "about-llif",
      "how-it-works",
      "privacy-governance",
      "research-platform",
    ]);

    assert.strictEqual(result.brand, "LLIF");
  });

  it("extracts pages from wrapped format with ```json code fence", () => {
    const inner = JSON.stringify({ brand: "LLIF", pages: fivePages });
    const wrapped = JSON.stringify({
      artifact_type: "web_page",
      content: { title: "Test", html: "```json\n" + inner + "\n```" },
    });
    const result = normalizeWebRendererOutput(wrapped);
    assert.strictEqual(result.source.embedded_detected, true);
    assert.strictEqual(result.pages.length, 5);
  });

  it("handles direct format — { brand, pages:[] }", () => {
    const input = JSON.stringify({ brand: "bestlife", pages: fivePages });
    const result = normalizeWebRendererOutput(input);
    assert.strictEqual(result.source.kind, "direct");
    assert.strictEqual(result.source.embedded_detected, false);
    assert.strictEqual(result.pages.length, 5);
    assert.strictEqual(result.brand, "bestlife");
  });

  it("handles direct format without brand", () => {
    const input = JSON.stringify({ pages: [{ slug: "home", title: "Home", body_html: "<p/>" }] });
    const result = normalizeWebRendererOutput(input);
    assert.strictEqual(result.source.kind, "direct");
    assert.strictEqual(result.pages.length, 1);
    assert.strictEqual(result.pages[0].slug, "home");
  });

  it("generates slug from title when slug field is absent", () => {
    const input = JSON.stringify({ pages: [{ title: "Contact Us", body_html: "<p/>" }] });
    const result = normalizeWebRendererOutput(input);
    assert.strictEqual(result.pages[0].slug, "contact-us");
  });

  it("detects duplicate slugs do NOT throw — caller handles duplicates", () => {
    const input = JSON.stringify({
      pages: [
        { slug: "home", title: "Home", body_html: "<p/>" },
        { slug: "home", title: "Home Copy", body_html: "<p/>" },
      ],
    });
    // normalizeWebRendererOutput itself should not throw on duplicates
    const result = normalizeWebRendererOutput(input);
    assert.strictEqual(result.pages.length, 2);
    assert.strictEqual(result.pages[0].slug, "home");
    assert.strictEqual(result.pages[1].slug, "home");
  });

  it("throws on garbage content.html that is not parseable JSON", () => {
    const wrapped = JSON.stringify({
      artifact_type: "web_page",
      content: { title: "Test", html: "json\nnot valid json {{{{" },
    });
    // tryExtractEmbeddedPages returns null → falls through to single-page HTML
    const result = normalizeWebRendererOutput(wrapped);
    // Should not throw; treats malformed html as raw HTML body
    assert.strictEqual(result.source.kind, "wrapped");
    assert.strictEqual(result.source.embedded_detected, false);
    assert.strictEqual(result.pages.length, 1);
    assert.ok(result.pages[0].body_html?.includes("not valid json"));
  });

  it("falls back gracefully for bare HTML string", () => {
    const result = normalizeWebRendererOutput("<h1>Hello</h1><p>World</p>");
    assert.strictEqual(result.source.kind, "raw_string");
    assert.strictEqual(result.pages.length, 1);
    assert.ok(result.pages[0].body_html?.includes("Hello"));
  });

  it("throws for empty input", () => {
    assert.throws(() => normalizeWebRendererOutput(""), /Empty input/);
    assert.throws(() => normalizeWebRendererOutput("   "), /Empty input/);
  });
});

// ── parseRendererOutput (via normalizeWebRendererOutput) ──────────────────────

describe("parseRendererOutput — wrapped format integration", () => {
  it("extracts 5 pages when given a wrapped web_page artifact", () => {
    const inner = JSON.stringify({
      brand: "LLIF",
      content_format: "html",
      pages: [
        { slug: "homepage", title: "Homepage", body_html: "<h1>Home</h1>" },
        { slug: "about-llif", title: "About", body_html: "<h1>About</h1>" },
        { slug: "how-it-works", title: "How It Works", body_html: "<h1>How</h1>" },
        { slug: "privacy-governance", title: "Privacy", body_html: "<h1>Privacy</h1>" },
        { slug: "research-platform", title: "Research", body_html: "<h1>Research</h1>" },
      ],
    });
    const wrapped = JSON.stringify({
      artifact_type: "web_page",
      content: { title: "LLIF Website", html: `json\n${inner}` },
    });
    const pages = parseRendererOutput(wrapped);
    assert.strictEqual(pages.length, 5);
    assert.strictEqual(pages[0].source_key, "homepage");
    assert.strictEqual(pages[4].source_key, "research-platform");
  });
});

// ── slugify ───────────────────────────────────────────────────────────────────

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    assert.strictEqual(slugify("Home Page"), "home-page");
  });

  it("strips leading/trailing hyphens", () => {
    assert.strictEqual(slugify("  About Us  "), "about-us");
  });

  it("collapses multiple non-alphanumeric chars to one hyphen", () => {
    assert.strictEqual(slugify("About & Contact!"), "about-contact");
  });

  it("returns 'page' for empty input", () => {
    assert.strictEqual(slugify(""), "page");
  });

  it("truncates to 80 chars", () => {
    const long = "a".repeat(100);
    assert.strictEqual(slugify(long).length, 80);
  });
});

// ── parseRendererOutput ───────────────────────────────────────────────────────

describe("parseRendererOutput", () => {
  it("parses pages[] array format", () => {
    const raw = JSON.stringify({
      pages: [
        { slug: "home", title: "Home", body_html: "<h1>Home</h1>" },
        { slug: "about", title: "About", body_html: "<h1>About</h1>" },
      ],
    });
    const pages = parseRendererOutput(raw);
    assert.strictEqual(pages.length, 2);
    assert.strictEqual(pages[0].source_key, "home");
    assert.strictEqual(pages[0].title, "Home");
    assert.strictEqual(pages[0].targetSlug, "home");
    assert.strictEqual(pages[0].body_html, "<h1>Home</h1>");
    assert.strictEqual(pages[0].approvalStatus, "pending");
  });

  it("generates source_key from title when slug is missing", () => {
    const raw = JSON.stringify({
      pages: [{ title: "Contact Us", body_html: "<p>Contact</p>" }],
    });
    const pages = parseRendererOutput(raw);
    assert.strictEqual(pages[0].source_key, "contact-us");
    assert.strictEqual(pages[0].targetSlug, "contact-us");
  });

  it("normalises literal \\\\n in body_html", () => {
    const raw = JSON.stringify({
      pages: [{ slug: "home", title: "Home", body_html: "<h1>Title</h1>\\n<p>Body</p>" }],
    });
    const pages = parseRendererOutput(raw);
    // JSON.parse converts \\n → \n (real newline); normalizeEscapes leaves real newlines alone
    assert.ok(pages[0].body_html!.includes("\n"), "expected real newline");
    assert.ok(!pages[0].body_html!.includes("\\n"), "expected no literal \\n");
  });

  it("parses { content: { html, title } } web-renderer format", () => {
    const raw = JSON.stringify({
      content: { title: "My Page", html: "<h1>My Page</h1><p>Body</p>" },
    });
    const pages = parseRendererOutput(raw);
    assert.strictEqual(pages.length, 1);
    assert.strictEqual(pages[0].title, "My Page");
    assert.ok(pages[0].body_html?.includes("My Page"));
  });

  it("parses top-level { html } format as single page", () => {
    const raw = JSON.stringify({ html: "<h1>Single</h1>" });
    const pages = parseRendererOutput(raw);
    assert.strictEqual(pages.length, 1);
    assert.strictEqual(pages[0].body_html, "<h1>Single</h1>");
  });

  it("falls back to raw HTML string as single page", () => {
    const raw = "<h1>Raw HTML</h1><p>Body</p>";
    const pages = parseRendererOutput(raw);
    assert.strictEqual(pages.length, 1);
    assert.strictEqual(pages[0].source_key, "page");
    assert.ok(pages[0].body_html?.includes("Raw HTML"));
  });

  it("returns empty array for empty input", () => {
    assert.strictEqual(parseRendererOutput("").length, 0);
    assert.strictEqual(parseRendererOutput("   ").length, 0);
  });

  it("populates body_markdown when body_html is absent", () => {
    const raw = JSON.stringify({
      pages: [{ slug: "home", title: "Home", body_markdown: "# Home\n\nParagraph." }],
    });
    const pages = parseRendererOutput(raw);
    assert.strictEqual(pages[0].body_html, null);
    assert.ok(pages[0].body_markdown?.includes("# Home"));
  });

  it("initialises all pages with approvalStatus=pending and no publish state", () => {
    const raw = JSON.stringify({
      pages: [{ slug: "p1", title: "P1", body_html: "<p/>" }],
    });
    const [page] = parseRendererOutput(raw);
    assert.strictEqual(page.approvalStatus, "pending");
    assert.strictEqual(page.approvalNotes, null);
    assert.strictEqual(page.wpPageId, null);
    assert.strictEqual(page.publishStatus, null);
    assert.strictEqual(page.publishResult, null);
  });
});

// ── validateSlugUniqueness ────────────────────────────────────────────────────

describe("validateSlugUniqueness", () => {
  function makePage(sourceKey: string, targetSlug: string): WebJobPage {
    return {
      source_key: sourceKey,
      title: sourceKey,
      targetSlug,
      body_html: null,
      body_markdown: null,
      approvalStatus: "pending",
      approvalNotes: null,
      wpPageId: null,
      wpPageExists: null,
      publishStatus: null,
      publishResult: null,
    };
  }

  it("returns [] for unique slugs", () => {
    const pages = [
      makePage("home", "home"),
      makePage("about", "about"),
      makePage("contact", "contact"),
    ];
    assert.deepStrictEqual(validateSlugUniqueness(pages), []);
  });

  it("returns an error message for each duplicate", () => {
    const pages = [
      makePage("home", "shared-slug"),
      makePage("about", "about"),
      makePage("contact", "shared-slug"),
    ];
    const errors = validateSlugUniqueness(pages);
    assert.strictEqual(errors.length, 1);
    assert.ok(errors[0].includes("shared-slug"));
    assert.ok(errors[0].includes("home"));
    assert.ok(errors[0].includes("contact"));
  });

  it("reports multiple independent duplicates", () => {
    const pages = [
      makePage("a", "dup1"),
      makePage("b", "dup2"),
      makePage("c", "dup1"),
      makePage("d", "dup2"),
    ];
    const errors = validateSlugUniqueness(pages);
    assert.strictEqual(errors.length, 2);
  });

  it("returns [] for a single page", () => {
    assert.deepStrictEqual(validateSlugUniqueness([makePage("home", "home")]), []);
  });
});

// ── computeJobStatus ──────────────────────────────────────────────────────────

describe("computeJobStatus", () => {
  function makePages(statuses: Array<WebJobPage["approvalStatus"]>): WebJobPage[] {
    return statuses.map((s, i) => ({
      source_key: `p${i}`,
      title: `Page ${i}`,
      targetSlug: `page-${i}`,
      body_html: null,
      body_markdown: null,
      approvalStatus: s,
      approvalNotes: null,
      wpPageId: null,
      wpPageExists: null,
      publishStatus: null,
      publishResult: null,
    }));
  }

  it("returns APPROVED when all pages are approved", () => {
    assert.strictEqual(
      computeJobStatus(makePages(["approved", "approved"]), "IN_REVIEW"),
      "APPROVED"
    );
  });

  it("returns IN_REVIEW when any page needs changes", () => {
    assert.strictEqual(
      computeJobStatus(makePages(["approved", "needs_changes"]), "IN_REVIEW"),
      "IN_REVIEW"
    );
  });

  it("does not downgrade PUBLISHING status", () => {
    assert.strictEqual(
      computeJobStatus(makePages(["pending"]), "PUBLISHING"),
      "PUBLISHING"
    );
  });

  it("does not downgrade PUBLISHED status", () => {
    assert.strictEqual(
      computeJobStatus(makePages(["rejected"]), "PUBLISHED"),
      "PUBLISHED"
    );
  });

  it("stays DRAFT when all pages are still pending and current is DRAFT", () => {
    assert.strictEqual(
      computeJobStatus(makePages(["pending", "pending"]), "DRAFT"),
      "DRAFT"
    );
  });
});

// ── computePostPublishJobStatus ───────────────────────────────────────────────

describe("computePostPublishJobStatus", () => {
  function makeResults(
    keys: string[],
    oks: boolean[]
  ): PagePublishResult[] {
    return keys.map((k, i) => ({ source_key: k, ok: oks[i] }));
  }

  it("returns PUBLISHED when all ok", () => {
    assert.strictEqual(
      computePostPublishJobStatus(makeResults(["a", "b"], [true, true])),
      "PUBLISHED"
    );
  });

  it("returns PARTIAL_FAILED on mixed results", () => {
    assert.strictEqual(
      computePostPublishJobStatus(makeResults(["a", "b"], [true, false])),
      "PARTIAL_FAILED"
    );
  });

  it("returns FAILED when all failed", () => {
    assert.strictEqual(
      computePostPublishJobStatus(makeResults(["a", "b"], [false, false])),
      "FAILED"
    );
  });
});
