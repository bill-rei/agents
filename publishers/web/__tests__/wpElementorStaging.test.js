const { describe, it, beforeEach, afterEach, mock } = require("node:test");
const assert = require("node:assert/strict");

const {
  validateMediaBindings,
  buildFigureHtml,
  applyMediaBindingsToBlockHtml,
  resolveMediaAssets,
} = require("../wpElementorStaging");

// ── Helpers ──

function makeAsset(overrides = {}) {
  return {
    asset_id: "img-1",
    source: "url",
    url: "https://example.com/photo.jpg",
    intent: "hero",
    seo: { alt: "Hero image", filename_slug: "hero-img", title: "Hero", caption: "A caption" },
    geo: { llm_description: "A hero photograph", entities: [], topics: [] },
    ...overrides,
  };
}

function makeBinding(overrides = {}) {
  return { asset_id: "img-1", placement: "above", ...overrides };
}

function makeArtifact({ assets = [makeAsset()], blocks = [], ...rest } = {}) {
  return {
    artifact_type: "web_page",
    media_assets: assets,
    content_blocks: blocks,
    ...rest,
  };
}

// ── B: Fail-fast validation ──

describe("validateMediaBindings", () => {
  it("passes when all bindings reference valid assets with required fields", () => {
    const artifact = makeArtifact({
      blocks: [{ block_id: "b1", html: "<p>Hi</p>", media_bindings: [makeBinding()] }],
    });
    assert.doesNotThrow(() => validateMediaBindings(artifact));
  });

  it("throws when binding references unknown asset_id", () => {
    const artifact = makeArtifact({
      assets: [makeAsset()],
      blocks: [{ block_id: "b1", html: "<p>Hi</p>", media_bindings: [makeBinding({ asset_id: "nope" })] }],
    });
    assert.throws(() => validateMediaBindings(artifact), /unknown asset_id="nope"/);
  });

  it("throws when asset is missing seo.alt", () => {
    const asset = makeAsset({ seo: { filename_slug: "hero", alt: "", title: "" }, });
    // alt is empty string → falsy
    const artifact = makeArtifact({
      assets: [asset],
      blocks: [{ block_id: "b1", html: "<p>Hi</p>", media_bindings: [makeBinding()] }],
    });
    assert.throws(() => validateMediaBindings(artifact), /missing required fields.*alt/);
  });

  it("throws when asset is missing seo.filename_slug", () => {
    const asset = makeAsset();
    asset.seo.filename_slug = "";
    const artifact = makeArtifact({
      assets: [asset],
      blocks: [{ block_id: "b1", html: "<p>Hi</p>", media_bindings: [makeBinding()] }],
    });
    assert.throws(() => validateMediaBindings(artifact), /filename_slug/);
  });

  it("throws when asset is missing geo.llm_description", () => {
    const asset = makeAsset();
    asset.geo.llm_description = "";
    const artifact = makeArtifact({
      assets: [asset],
      blocks: [{ block_id: "b1", html: "<p>Hi</p>", media_bindings: [makeBinding()] }],
    });
    assert.throws(() => validateMediaBindings(artifact), /llm_description/);
  });

  it("collects multiple errors into one throw", () => {
    const asset = makeAsset({ seo: { alt: "", filename_slug: "" }, geo: { llm_description: "" } });
    const artifact = makeArtifact({
      assets: [asset],
      blocks: [{ block_id: "b1", html: "<p>Hi</p>", media_bindings: [makeBinding()] }],
    });
    try {
      validateMediaBindings(artifact);
      assert.fail("should have thrown");
    } catch (err) {
      assert.ok(err.message.includes("alt"), "should mention alt");
      assert.ok(err.message.includes("filename_slug"), "should mention filename_slug");
      assert.ok(err.message.includes("llm_description"), "should mention llm_description");
    }
  });

  it("skips blocks with no media_bindings", () => {
    const artifact = makeArtifact({
      blocks: [{ block_id: "b1", html: "<p>Hi</p>" }],
    });
    assert.doesNotThrow(() => validateMediaBindings(artifact));
  });
});

// ── D: buildFigureHtml ──

describe("buildFigureHtml", () => {
  it("builds basic figure with intent class", () => {
    const html = buildFigureHtml({ wp_url: "/img.jpg", alt: "test", intent: "hero" });
    assert.ok(html.includes('class="bla-media bla-media--hero"'));
    assert.ok(html.includes('src="/img.jpg"'));
    assert.ok(html.includes('alt="test"'));
    assert.ok(!html.includes("<figcaption>"));
    assert.ok(!html.includes("<a "));
  });

  it("includes alignment and size classes", () => {
    const html = buildFigureHtml({
      wp_url: "/img.jpg", alt: "t", intent: "section", alignment: "center", size: "wide",
    });
    assert.ok(html.includes("bla-media--center"));
    assert.ok(html.includes("bla-media--wide"));
  });

  it("wraps img in link when link_to is provided", () => {
    const html = buildFigureHtml({
      wp_url: "/img.jpg", alt: "t", intent: "inline", link_to: "https://example.com",
    });
    assert.ok(html.includes('<a href="https://example.com">'));
    assert.ok(html.includes("</a>"));
  });

  it("includes figcaption when caption provided", () => {
    const html = buildFigureHtml({
      wp_url: "/img.jpg", alt: "t", intent: "hero", caption: "My caption",
    });
    assert.ok(html.includes("<figcaption>My caption</figcaption>"));
  });

  it("escapes double quotes in alt text", () => {
    const html = buildFigureHtml({ wp_url: "/img.jpg", alt: 'say "hello"', intent: "hero" });
    assert.ok(html.includes('alt="say &quot;hello&quot;"'));
  });
});

// ── D: applyMediaBindingsToBlockHtml ──

describe("applyMediaBindingsToBlockHtml", () => {
  const resolvedMap = new Map([
    ["img-1", { wp_url: "/hero.jpg", alt: "Hero", caption: null, intent: "hero" }],
    ["img-2", { wp_url: "/sec.jpg", alt: "Section", caption: "Cap", intent: "section" }],
  ]);

  it("placement=above prepends figure before block html", () => {
    const result = applyMediaBindingsToBlockHtml(
      "<p>Hello</p>",
      [makeBinding({ asset_id: "img-1", placement: "above" })],
      resolvedMap
    );
    const figIdx = result.indexOf("<figure");
    const pIdx = result.indexOf("<p>Hello</p>");
    assert.ok(figIdx < pIdx, "figure should come before paragraph");
  });

  it("placement=below appends figure after block html", () => {
    const result = applyMediaBindingsToBlockHtml(
      "<p>Hello</p>",
      [makeBinding({ asset_id: "img-1", placement: "below" })],
      resolvedMap
    );
    const figIdx = result.indexOf("<figure");
    const pIdx = result.indexOf("<p>Hello</p>");
    assert.ok(figIdx > pIdx, "figure should come after paragraph");
  });

  it("placement=inline inserts after first </p>", () => {
    const result = applyMediaBindingsToBlockHtml(
      "<p>First</p><p>Second</p>",
      [makeBinding({ asset_id: "img-1", placement: "inline" })],
      resolvedMap
    );
    const firstPClose = result.indexOf("</p>");
    const figIdx = result.indexOf("<figure");
    assert.ok(figIdx > firstPClose, "figure should come after first </p>");
    assert.ok(figIdx < result.indexOf("<p>Second</p>"), "figure should come before second <p>");
  });

  it("placement=inline appends if no </p> found", () => {
    const result = applyMediaBindingsToBlockHtml(
      "<div>No paragraphs</div>",
      [makeBinding({ asset_id: "img-1", placement: "inline" })],
      resolvedMap
    );
    assert.ok(result.startsWith("<div>No paragraphs</div>"));
    assert.ok(result.includes("<figure"));
  });

  it("returns original html when no bindings", () => {
    assert.equal(applyMediaBindingsToBlockHtml("<p>Hi</p>", null, resolvedMap), "<p>Hi</p>");
    assert.equal(applyMediaBindingsToBlockHtml("<p>Hi</p>", [], resolvedMap), "<p>Hi</p>");
  });

  it("passes alignment and size through to figure", () => {
    const result = applyMediaBindingsToBlockHtml(
      "<p>Hi</p>",
      [makeBinding({ asset_id: "img-2", placement: "below", alignment: "center", size: "wide" })],
      resolvedMap
    );
    assert.ok(result.includes("bla-media--center"));
    assert.ok(result.includes("bla-media--wide"));
  });
});

// ── C: resolveMediaAssets (mocked fetch) ──

describe("resolveMediaAssets", () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("imports url-sourced image: downloads, uploads to /media, updates meta", async () => {
    const calls = [];

    globalThis.fetch = async (url, opts) => {
      calls.push({ url, method: opts?.method || "GET" });

      // 1st call: download from source URL
      if (url === "https://example.com/photo.jpg") {
        return {
          ok: true,
          headers: { get: () => "image/jpeg" },
          arrayBuffer: async () => new ArrayBuffer(8),
        };
      }
      // 2nd call: upload to WP media
      if (url.includes("/wp-json/wp/v2/media") && opts?.method === "POST" && !url.match(/\/\d+$/)) {
        return {
          ok: true,
          json: async () => ({ id: 42, source_url: "https://staging.example.com/wp-content/uploads/hero-img.jpg" }),
        };
      }
      // 3rd call: update meta
      if (url.match(/\/wp-json\/wp\/v2\/media\/42$/) && opts?.method === "POST") {
        return {
          ok: true,
          json: async () => ({ id: 42 }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    };

    const artifact = makeArtifact({
      assets: [makeAsset()],
      blocks: [{ block_id: "b1", html: "<p>Hi</p>", media_bindings: [makeBinding()] }],
    });

    const map = await resolveMediaAssets("https://staging.example.com", "Basic abc", artifact);

    assert.equal(map.size, 1);
    assert.equal(map.get("img-1").cms_media_id, 42);
    assert.equal(map.get("img-1").wp_url, "https://staging.example.com/wp-content/uploads/hero-img.jpg");
    assert.equal(calls.length, 3);
    assert.equal(calls[0].url, "https://example.com/photo.jpg");
    assert.ok(calls[1].url.includes("/wp-json/wp/v2/media"));
    assert.equal(calls[1].method, "POST");
  });

  it("resolves cms-sourced asset by fetching media by id", async () => {
    globalThis.fetch = async (url) => {
      if (url.includes("/wp-json/wp/v2/media/99")) {
        return {
          ok: true,
          json: async () => ({ id: 99, source_url: "https://staging.example.com/wp-content/uploads/existing.jpg" }),
        };
      }
      throw new Error(`Unexpected fetch: ${url}`);
    };

    const asset = makeAsset({ source: "cms", cms_media_id: 99, url: undefined });
    const artifact = makeArtifact({
      assets: [asset],
      blocks: [{ block_id: "b1", html: "<p>Hi</p>", media_bindings: [makeBinding()] }],
    });

    const map = await resolveMediaAssets("https://staging.example.com", "Basic abc", artifact);
    assert.equal(map.get("img-1").cms_media_id, 99);
    assert.equal(map.get("img-1").wp_url, "https://staging.example.com/wp-content/uploads/existing.jpg");
  });

  it("skips assets not referenced by any binding", async () => {
    globalThis.fetch = async () => {
      throw new Error("should not be called");
    };

    const artifact = makeArtifact({
      assets: [makeAsset({ asset_id: "unused" })],
      blocks: [{ block_id: "b1", html: "<p>Hi</p>", media_bindings: [] }],
    });

    const map = await resolveMediaAssets("https://staging.example.com", "Basic abc", artifact);
    assert.equal(map.size, 0);
  });
});
