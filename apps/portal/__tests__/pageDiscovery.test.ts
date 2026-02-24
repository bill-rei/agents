/**
 * Unit tests for CMS page discovery — Phase D (dynamic page selector).
 * Framework: node:test (same pattern as the rest of the portal tests).
 *
 * Tests cover:
 *  - stripHtml (HTML entity decoding + tag removal)
 *  - listWordpressPages: pagination across multiple pages
 *  - listWordpressPages: Basic Auth header construction
 *  - listWordpressPages: error propagation
 *  - filterPages: case-insensitive title matching
 *  - filterPages: case-insensitive slug matching
 *  - filterPages: empty query returns all pages
 *  - listPages dispatcher: squarespace throws stub error
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

import { stripHtml } from "../src/lib/cms/providers/wordpress";
import { listWordpressPages } from "../src/lib/cms/providers/wordpress";
import { filterPages, listPages } from "../src/lib/cms/pageDiscovery";
import type { CmsPage, TargetSiteConfig } from "../src/lib/cms/pageDiscovery";

// ── fetch mock helpers ────────────────────────────────────────────────────────

type FetchMock = (url: string, init?: RequestInit) => Promise<Response>;

function makeFetch(handler: FetchMock) {
  return handler as typeof fetch;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ── stripHtml ─────────────────────────────────────────────────────────────────

describe("stripHtml", () => {
  it("removes simple tags", () => {
    assert.strictEqual(stripHtml("<b>Hello</b>"), "Hello");
  });

  it("decodes &amp;", () => {
    assert.strictEqual(stripHtml("Caf&amp;Bar"), "Caf&Bar");
  });

  it("decodes &lt; and &gt;", () => {
    assert.strictEqual(stripHtml("a &lt; b &gt; c"), "a < b > c");
  });

  it("decodes &quot;", () => {
    assert.strictEqual(stripHtml("Say &quot;hi&quot;"), 'Say "hi"');
  });

  it("decodes &#039;", () => {
    assert.strictEqual(stripHtml("it&#039;s"), "it's");
  });

  it("decodes &nbsp;", () => {
    assert.strictEqual(stripHtml("foo&nbsp;bar"), "foo bar");
  });

  it("strips nested tags and decodes entities together", () => {
    assert.strictEqual(
      stripHtml("<strong>Caf&amp;</strong> <em>Bar</em>"),
      "Caf& Bar"
    );
  });

  it("returns empty string for empty input", () => {
    assert.strictEqual(stripHtml(""), "");
  });
});

// ── listWordpressPages: pagination ────────────────────────────────────────────

describe("listWordpressPages — pagination", () => {
  let originalFetch: typeof fetch;
  const capturedUrls: string[] = [];

  before(() => {
    originalFetch = global.fetch;
    // Simulate 3 pages: page 1 returns 100 rows, page 2 returns 100, page 3 returns 5
    global.fetch = makeFetch(async (url) => {
      capturedUrls.push(url as string);
      const urlObj = new URL(url as string);
      const pageNum = parseInt(urlObj.searchParams.get("page") || "1", 10);
      const perPage = parseInt(urlObj.searchParams.get("per_page") || "100", 10);

      if (pageNum === 1 || pageNum === 2) {
        // Full page — return 100 items
        const rows = Array.from({ length: perPage }, (_, i) => ({
          id: (pageNum - 1) * perPage + i + 1,
          slug: `page-${(pageNum - 1) * perPage + i + 1}`,
          link: `https://example.com/page-${i + 1}`,
          status: "publish",
          title: { rendered: `Page ${(pageNum - 1) * perPage + i + 1}` },
        }));
        return jsonResponse(rows);
      }

      if (pageNum === 3) {
        // Last page — partial result
        const rows = Array.from({ length: 5 }, (_, i) => ({
          id: 200 + i + 1,
          slug: `last-page-${i + 1}`,
          link: `https://example.com/last-${i + 1}`,
          status: "draft",
          title: { rendered: `Last Page ${i + 1}` },
        }));
        return jsonResponse(rows);
      }

      return jsonResponse([], 200);
    });
  });

  after(() => {
    global.fetch = originalFetch;
    capturedUrls.length = 0;
  });

  it("fetches all 205 pages across 3 API calls", async () => {
    const config: TargetSiteConfig = {
      provider: "wordpress",
      baseUrl: "https://staging.example.com",
    };
    const pages = await listWordpressPages(config);
    assert.strictEqual(pages.length, 205, `Expected 205 pages, got ${pages.length}`);
  });

  it("makes exactly 3 fetch calls", () => {
    assert.strictEqual(capturedUrls.length, 3);
  });

  it("includes status=any in every request URL", () => {
    for (const url of capturedUrls) {
      assert.ok(url.includes("status=any"), `Missing status=any in: ${url}`);
    }
  });

  it("uses orderby=title&order=asc", () => {
    assert.ok(capturedUrls[0].includes("orderby=title"));
    assert.ok(capturedUrls[0].includes("order=asc"));
  });

  it("last page items have draft status", async () => {
    const config: TargetSiteConfig = {
      provider: "wordpress",
      baseUrl: "https://staging.example.com",
    };
    const pages = await listWordpressPages(config);
    const draftPages = pages.filter((p) => p.status === "draft");
    assert.strictEqual(draftPages.length, 5);
  });
});

// ── listWordpressPages: Basic Auth ────────────────────────────────────────────

describe("listWordpressPages — Basic Auth", () => {
  let originalFetch: typeof fetch;
  let capturedAuth: string | null = null;

  before(() => {
    originalFetch = global.fetch;
    global.fetch = makeFetch(async (_url, init) => {
      const headers = (init?.headers as Record<string, string>) || {};
      capturedAuth = headers.Authorization || headers.authorization || null;
      return jsonResponse([]); // empty → stops pagination immediately
    });
  });

  after(() => {
    global.fetch = originalFetch;
    capturedAuth = null;
  });

  it("sends Basic Auth header when credentials are provided", async () => {
    await listWordpressPages({
      provider: "wordpress",
      baseUrl: "https://staging.example.com",
      username: "admin",
      appPassword: "secretpassword",
    });

    assert.ok(capturedAuth !== null, "No Authorization header sent");
    assert.ok(
      capturedAuth!.startsWith("Basic "),
      `Expected Basic auth, got: ${capturedAuth}`
    );

    // Verify the token decodes correctly
    const token = capturedAuth!.slice("Basic ".length);
    const decoded = Buffer.from(token, "base64").toString("utf8");
    assert.strictEqual(decoded, "admin:secretpassword");
  });

  it("sends no Authorization header when credentials are omitted", async () => {
    await listWordpressPages({
      provider: "wordpress",
      baseUrl: "https://staging.example.com",
    });
    assert.strictEqual(capturedAuth, null);
  });
});

// ── listWordpressPages: error handling ────────────────────────────────────────

describe("listWordpressPages — error handling", () => {
  let originalFetch: typeof fetch;

  before(() => {
    originalFetch = global.fetch;
    global.fetch = makeFetch(async () => {
      return new Response("Forbidden", { status: 403 });
    });
  });

  after(() => {
    global.fetch = originalFetch;
  });

  it("throws a descriptive error on non-OK response", async () => {
    try {
      await listWordpressPages({
        provider: "wordpress",
        baseUrl: "https://staging.example.com",
      });
      assert.fail("Expected error to be thrown");
    } catch (err) {
      assert.ok(err instanceof Error);
      assert.ok(
        err.message.includes("403"),
        `Expected error to mention status 403: ${err.message}`
      );
    }
  });
});

// ── filterPages ───────────────────────────────────────────────────────────────

const samplePages: CmsPage[] = [
  { id: 1, title: "Homepage", slug: "home", status: "publish" },
  { id: 2, title: "About Us", slug: "about", status: "publish" },
  { id: 3, title: "Sleep Program", slug: "sleep-program", status: "draft" },
  { id: 4, title: "Contact", slug: "contact-us", status: "publish" },
  { id: 5, title: "Longevity Tips", slug: "longevity", status: "publish" },
];

describe("filterPages — empty query", () => {
  it("returns all pages when query is empty string", () => {
    assert.strictEqual(filterPages(samplePages, "").length, 5);
  });

  it("returns all pages when query is whitespace only", () => {
    assert.strictEqual(filterPages(samplePages, "   ").length, 5);
  });
});

describe("filterPages — title matching", () => {
  it("matches title case-insensitively (lowercase query)", () => {
    const result = filterPages(samplePages, "homepage");
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].slug, "home");
  });

  it("matches title case-insensitively (uppercase query)", () => {
    const result = filterPages(samplePages, "ABOUT");
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].slug, "about");
  });

  it("matches partial title", () => {
    const result = filterPages(samplePages, "program");
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].slug, "sleep-program");
  });

  it("returns multiple matches when multiple titles match", () => {
    // Both "Homepage" and "Longevity Tips" don't share a word; try "ge" which matches "Homepage" and "Longevity"
    const result = filterPages(samplePages, "ge");
    assert.ok(result.length >= 2, `Expected ≥2 matches for "ge", got ${result.length}`);
  });
});

describe("filterPages — slug matching", () => {
  it("matches slug case-insensitively", () => {
    const result = filterPages(samplePages, "CONTACT-US");
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].slug, "contact-us");
  });

  it("matches partial slug", () => {
    const result = filterPages(samplePages, "sleep");
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].slug, "sleep-program");
  });

  it("matches slug when title does not match", () => {
    // "longevity" matches slug "longevity" but "Longevity Tips" also matches by title
    const result = filterPages(samplePages, "longevity");
    assert.ok(result.length >= 1);
    assert.ok(result.some((p) => p.slug === "longevity"));
  });
});

describe("filterPages — no match", () => {
  it("returns empty array when nothing matches", () => {
    const result = filterPages(samplePages, "zzznomatch");
    assert.strictEqual(result.length, 0);
  });
});

// ── listPages dispatcher ──────────────────────────────────────────────────────

describe("listPages — squarespace stub", () => {
  it("throws a helpful not-implemented error for squarespace", async () => {
    try {
      await listPages({ provider: "squarespace", baseUrl: "https://example.squarespace.com" });
      assert.fail("Expected error to be thrown");
    } catch (err) {
      assert.ok(err instanceof Error);
      assert.ok(
        err.message.toLowerCase().includes("squarespace"),
        `Error should mention squarespace: ${err.message}`
      );
      assert.ok(
        err.message.toLowerCase().includes("not implemented"),
        `Error should say not implemented: ${err.message}`
      );
    }
  });
});
