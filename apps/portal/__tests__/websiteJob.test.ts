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
