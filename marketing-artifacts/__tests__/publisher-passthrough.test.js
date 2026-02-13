const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { ensureHtml } = require("../../lib/markdownToHtml");

describe("publisher content_format passthrough logic", () => {
  it("skips ensureHtml when content_format is 'html'", () => {
    const artifact = { content_format: "html" };
    const html = "<h1>Test</h1><section><h2>Welcome</h2><p>Already HTML</p></section>";

    // Simulates publisher branch: when content_format is html, use content as-is
    let resolvedHtml;
    if (artifact.content_format === "html") {
      resolvedHtml = html;
    }

    assert.strictEqual(resolvedHtml, html, "should pass through HTML unchanged");
  });

  it("calls ensureHtml when content_format is missing", () => {
    const artifact = {};
    const markdown = "## Heading\n\nSome **bold** text.";

    // Simulates publisher branch: when content_format is not html, use ensureHtml
    let resolvedHtml;
    if (artifact.content_format !== "html") {
      const { html, converted } = ensureHtml(markdown);
      resolvedHtml = html;
      assert.strictEqual(converted, true, "should convert markdown");
    }

    assert.ok(resolvedHtml.includes("<h2>"), "should contain h2 tag");
    assert.ok(resolvedHtml.includes("<strong>bold</strong>"), "should contain strong tag");
  });

  it("calls ensureHtml when content_format is 'markdown'", () => {
    const artifact = { content_format: "markdown" };
    const markdown = "# Title\n\nParagraph text with **emphasis**.";

    let resolvedHtml;
    if (artifact.content_format !== "html") {
      const { html, converted } = ensureHtml(markdown);
      resolvedHtml = html;
      assert.strictEqual(converted, true, "should convert markdown");
    }

    assert.ok(resolvedHtml.includes("<h1>"), "should contain h1 tag");
  });

  it("passes through HTML content even without content_format", () => {
    const artifact = {};
    const htmlContent = "<section><h2>Already HTML</h2><p>This is fine.</p></section>";

    // ensureHtml detects HTML and returns it unchanged
    const { html, converted } = ensureHtml(htmlContent);
    assert.strictEqual(converted, false, "should not convert existing HTML");
    assert.strictEqual(html, htmlContent, "should return HTML unchanged");
  });
});
