const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { ensureHtml, looksLikeHtml, looksLikeMarkdown } = require("../../lib/markdownToHtml");

describe("markdownToHtml", () => {
  describe("looksLikeHtml", () => {
    it("detects HTML starting with a tag", () => {
      assert.strictEqual(looksLikeHtml("<div>hello</div>"), true);
    });

    it("detects HTML with block-level tags", () => {
      assert.strictEqual(looksLikeHtml("Some text\n<section>content</section>"), true);
    });

    it("returns false for plain text", () => {
      assert.strictEqual(looksLikeHtml("Just plain text"), false);
    });

    it("returns false for markdown", () => {
      assert.strictEqual(looksLikeHtml("## Heading\n\nSome text"), false);
    });

    it("returns false for empty/null", () => {
      assert.strictEqual(looksLikeHtml(""), false);
      assert.strictEqual(looksLikeHtml(null), false);
    });
  });

  describe("looksLikeMarkdown", () => {
    it("detects headings", () => {
      assert.strictEqual(looksLikeMarkdown("## Welcome"), true);
    });

    it("detects bold text", () => {
      assert.strictEqual(looksLikeMarkdown("Some **bold** text"), true);
    });

    it("detects bullet lists", () => {
      assert.strictEqual(looksLikeMarkdown("- item one\n- item two"), true);
    });

    it("detects links", () => {
      assert.strictEqual(looksLikeMarkdown("Visit [our site](https://example.com)"), true);
    });

    it("returns false for plain text", () => {
      assert.strictEqual(looksLikeMarkdown("Just plain text here"), false);
    });
  });

  describe("ensureHtml", () => {
    it("passes through existing HTML unchanged", () => {
      const html = "<section><h2>Hello</h2><p>World</p></section>";
      const result = ensureHtml(html);
      assert.strictEqual(result.html, html);
      assert.strictEqual(result.converted, false);
    });

    it("converts markdown to HTML", () => {
      const md = "## Welcome\n\nSome **bold** text.\n\n- item one\n- item two";
      const result = ensureHtml(md);
      assert.strictEqual(result.converted, true);
      assert.ok(result.html.includes("<h2>"), "should contain h2 tag");
      assert.ok(result.html.includes("<strong>bold</strong>"), "should contain strong tag");
      assert.ok(result.html.includes("<li>"), "should contain li tags");
    });

    it("wraps plain text in paragraph tags", () => {
      const text = "First paragraph\n\nSecond paragraph";
      const result = ensureHtml(text);
      assert.strictEqual(result.converted, true);
      assert.ok(result.html.includes("<p>First paragraph</p>"), "should wrap in p tags");
      assert.ok(result.html.includes("<p>Second paragraph</p>"), "should wrap second paragraph");
    });

    it("returns empty string for null/empty input", () => {
      assert.deepStrictEqual(ensureHtml(""), { html: "", converted: false });
      assert.deepStrictEqual(ensureHtml(null), { html: "", converted: false });
    });

    it("converts blockquotes", () => {
      const md = "> A great quote";
      const result = ensureHtml(md);
      assert.strictEqual(result.converted, true);
      assert.ok(result.html.includes("<blockquote>"), "should contain blockquote");
    });
  });
});
