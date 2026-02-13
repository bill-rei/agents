const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const {
  loadRegistry,
  normalizePageKey,
  resolvePageSlug,
  listSiteKeys,
  listPageKeys,
  clearCache,
} = require("../../lib/targetRegistry");

beforeEach(() => {
  clearCache();
});

describe("targetRegistry", () => {
  describe("loadRegistry", () => {
    it("loads bestlife-staging registry", () => {
      const reg = loadRegistry("bestlife-staging");
      assert.strictEqual(reg.site_key, "bestlife-staging");
      assert.strictEqual(reg.environment, "staging");
      assert.ok(reg.pages.homepage, "should have homepage page entry");
    });

    it("throws for unknown site key", () => {
      assert.throws(() => loadRegistry("nonexistent-site"), /No target registry found/);
    });
  });

  describe("normalizePageKey (aliases)", () => {
    it("resolves 'home' alias to 'homepage' for bestlife-staging", () => {
      const result = normalizePageKey("bestlife-staging", "home");
      assert.strictEqual(result, "homepage");
    });

    it("resolves 'index' alias to 'homepage' for bestlife-staging", () => {
      const result = normalizePageKey("bestlife-staging", "index");
      assert.strictEqual(result, "homepage");
    });

    it("returns canonical key unchanged", () => {
      const result = normalizePageKey("bestlife-staging", "homepage");
      assert.strictEqual(result, "homepage");
    });

    it("returns unknown key unchanged (no alias match)", () => {
      const result = normalizePageKey("bestlife-staging", "unknown-page");
      assert.strictEqual(result, "unknown-page");
    });
  });

  describe("resolvePageSlug", () => {
    it("resolves homepage to correct staging slug", () => {
      const result = resolvePageSlug("bestlife-staging", "homepage");
      assert.strictEqual(result.slug, "bestlife-homepage-agent-draft");
      assert.strictEqual(result.canonicalKey, "homepage");
    });

    it("resolves alias 'home' to homepage slug", () => {
      const result = resolvePageSlug("bestlife-staging", "home");
      assert.strictEqual(result.slug, "bestlife-homepage-agent-draft");
      assert.strictEqual(result.canonicalKey, "homepage");
    });

    it("resolves about page", () => {
      const result = resolvePageSlug("bestlife-staging", "about");
      assert.strictEqual(result.slug, "bestlife-about-agent-draft");
    });

    it("throws for unknown page key", () => {
      assert.throws(
        () => resolvePageSlug("bestlife-staging", "nonexistent"),
        /Unknown page_key/
      );
    });
  });

  describe("listSiteKeys / listPageKeys", () => {
    it("lists available site keys", () => {
      const keys = listSiteKeys();
      assert.ok(keys.includes("bestlife-staging"), "should include bestlife-staging");
    });

    it("lists page keys for bestlife-staging", () => {
      const keys = listPageKeys("bestlife-staging");
      assert.ok(keys.includes("homepage"), "should include homepage");
      assert.ok(keys.includes("about"), "should include about");
      assert.ok(keys.includes("contact"), "should include contact");
    });
  });
});
