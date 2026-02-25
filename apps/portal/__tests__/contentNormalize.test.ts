import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { normalizeEscapes } from "../src/lib/content/normalizeEscapes";
import { extractWebPageBody } from "../src/lib/content/extractWebPageBody";

// ── normalizeEscapes ──────────────────────────────────────────────────────────

describe("normalizeEscapes", () => {
  it("converts \\n to a real newline", () => {
    // The string literal "\\n" contains backslash + n (two chars).
    const input = "<h1>Hello</h1>\\n<p>World</p>";
    const result = normalizeEscapes(input);
    assert.strictEqual(result, "<h1>Hello</h1>\n<p>World</p>");
  });

  it("converts \\t to a real tab", () => {
    const result = normalizeEscapes("line1\\tline2");
    assert.strictEqual(result, "line1\tline2");
  });

  it("converts \\\" to a double-quote", () => {
    const result = normalizeEscapes('He said \\"hello\\"');
    assert.strictEqual(result, 'He said "hello"');
  });

  it("converts \\' to a single-quote", () => {
    const result = normalizeEscapes("it\\'s here");
    assert.strictEqual(result, "it's here");
  });

  it("collapses \\r\\n to a single newline", () => {
    const result = normalizeEscapes("line1\\r\\nline2");
    assert.strictEqual(result, "line1\nline2");
  });

  it("returns the string unchanged when no escape sequences are present (fast path)", () => {
    const input = "<h1>Hello</h1>\n<p>World</p>"; // real newline, no \n literal
    const result = normalizeEscapes(input);
    assert.strictEqual(result, input);
  });

  it("handles multiple escape sequences in one string", () => {
    const result = normalizeEscapes("<h1>Title</h1>\\n<p>Para 1</p>\\n<p>Para 2</p>");
    assert.strictEqual(result, "<h1>Title</h1>\n<p>Para 1</p>\n<p>Para 2</p>");
  });

  it("does not modify strings with no escape-like content", () => {
    const input = "<p>Hello & World</p>";
    assert.strictEqual(normalizeEscapes(input), input);
  });
});

// ── extractWebPageBody ────────────────────────────────────────────────────────

describe("extractWebPageBody", () => {
  // ── Raw HTML / markdown ────────────────────────────────────────────────────

  it("treats plain HTML as raw_html and returns it normalised", () => {
    const result = extractWebPageBody("<h1>Hi</h1>\\n<p>There</p>", {});
    assert.strictEqual(result.detected, "raw_html");
    assert.strictEqual(result.body, "<h1>Hi</h1>\n<p>There</p>");
    assert.ok(!result.warnings?.length);
  });

  it("treats plain markdown as raw_html", () => {
    const result = extractWebPageBody("# Title\n\nSome text.", {});
    assert.strictEqual(result.detected, "raw_html");
    assert.ok(result.body.includes("Title"));
  });

  it("trims leading/trailing whitespace before processing", () => {
    const result = extractWebPageBody("  <p>hi</p>  ", {});
    assert.strictEqual(result.body, "<p>hi</p>");
  });

  // ── JSON with top-level html field ─────────────────────────────────────────

  it("extracts from JSON { html } field", () => {
    const content = JSON.stringify({ html: "<h1>Title</h1>\\n<p>Body</p>" });
    const result = extractWebPageBody(content, {});
    assert.strictEqual(result.detected, "json_body_html");
    // The JSON.stringify above produced {"html":"<h1>Title</h1>\\n<p>Body</p>"}
    // JSON.parse in extractWebPageBody gives html = '<h1>Title</h1>\n<p>Body</p>'
    // (because \n in a JSON string means real newline).
    // normalizeEscapes on that string sees no backslash-n, returns it unchanged.
    assert.ok(result.body.includes("<h1>Title</h1>"));
    assert.ok(!result.warnings?.length);
  });

  it("extracts from JSON { body } field", () => {
    const content = JSON.stringify({ body: "<p>Hello</p>" });
    const result = extractWebPageBody(content, {});
    assert.strictEqual(result.detected, "raw_html");
    assert.strictEqual(result.body, "<p>Hello</p>");
  });

  // ── JSON pages[] array — slug selection ───────────────────────────────────

  it("selects the correct page from pages[] by slug", () => {
    const content = JSON.stringify({
      pages: [
        { slug: "home", body_html: "<h1>Home</h1>" },
        { slug: "about", body_html: "<h1>About</h1>" },
      ],
    });
    const result = extractWebPageBody(content, { selectedSlug: "home" });
    assert.strictEqual(result.detected, "json_body_html");
    assert.strictEqual(result.body, "<h1>Home</h1>");
    assert.ok(!result.warnings?.length);
  });

  it("uses the only page when no slug is specified and array has one entry", () => {
    const content = JSON.stringify({
      pages: [{ slug: "home", body_html: "<h1>Only Page</h1>" }],
    });
    const result = extractWebPageBody(content, {});
    assert.strictEqual(result.detected, "json_body_html");
    assert.strictEqual(result.body, "<h1>Only Page</h1>");
  });

  it("returns unknown with warning when slug not found in multi-page array", () => {
    const content = JSON.stringify({
      pages: [
        { slug: "home", body_html: "<h1>Home</h1>" },
        { slug: "about", body_html: "<h1>About</h1>" },
      ],
    });
    const result = extractWebPageBody(content, { selectedSlug: "contact" });
    assert.strictEqual(result.detected, "unknown");
    assert.strictEqual(result.body, "");
    assert.ok(result.warnings && result.warnings.length > 0);
    assert.ok(result.warnings![0].includes("contact"));
  });

  it("returns unknown with warning when no slug and multiple pages", () => {
    const content = JSON.stringify({
      pages: [
        { slug: "home", body_html: "<h1>Home</h1>" },
        { slug: "about", body_html: "<h1>About</h1>" },
      ],
    });
    const result = extractWebPageBody(content, {});
    assert.strictEqual(result.detected, "unknown");
    assert.ok(result.warnings && result.warnings.length > 0);
  });

  it("returns json_body_markdown when page has body_markdown", () => {
    const content = JSON.stringify({
      pages: [{ slug: "home", body_markdown: "# Title\n\nParagraph." }],
    });
    const result = extractWebPageBody(content, { selectedSlug: "home" });
    assert.strictEqual(result.detected, "json_body_markdown");
    assert.ok(result.body.includes("Title"));
  });

  it("prefers body_html over body_markdown when both exist", () => {
    const content = JSON.stringify({
      pages: [
        {
          slug: "home",
          body_html: "<h1>HTML</h1>",
          body_markdown: "# Markdown",
        },
      ],
    });
    const result = extractWebPageBody(content, { selectedSlug: "home" });
    assert.strictEqual(result.detected, "json_body_html");
    assert.strictEqual(result.body, "<h1>HTML</h1>");
  });

  // ── Escape normalisation through JSON path ─────────────────────────────────

  it("normalises literal \\n in body_html from agent JSON output", () => {
    // Simulate what an agent produces as raw text:
    // {"pages":[{"slug":"home","body_html":"<h1>Hi</h1>\n<p>World</p>"}]}
    // When this raw text is stored in the DB (as a string), the \n is the
    // two characters backslash + n — NOT a real newline.
    // JSON.parse turns \n (in JSON) into a real newline, but the agent may
    // have produced the JSON with a literal escaped newline visible as \\n
    // in the raw output.
    //
    // We test the case where the DB stores the text verbatim (with literal \n):
    const rawAgentOutput =
      '{"pages":[{"slug":"home","body_html":"<h1>Hi</h1>\\n<p>World</p>"}]}';
    // JSON.parse of rawAgentOutput gives body_html = "<h1>Hi</h1>\n<p>World</p>"
    // where \n is a real newline (JSON parsing handles it).
    // normalizeEscapes then has nothing to do, so the body is clean.
    const result = extractWebPageBody(rawAgentOutput, { selectedSlug: "home" });
    assert.strictEqual(result.detected, "json_body_html");
    // The result should have a real newline, not literal \n
    assert.ok(result.body.includes("\n"), "expected real newline in body");
    assert.ok(!result.body.includes("\\n"), "expected no literal \\n in body");
  });

  it("normalises literal \\n in raw HTML content (not JSON)", () => {
    // User pastes raw HTML with literal backslash-n sequences (not JSON).
    const rawHtml = "<h1>Title</h1>\\n<p>Para</p>";
    const result = extractWebPageBody(rawHtml, {});
    assert.strictEqual(result.detected, "raw_html");
    assert.ok(result.body.includes("\n"), "expected real newline");
    assert.ok(!result.body.includes("\\n"), "expected no literal \\n");
  });

  // ── Invalid JSON fallback ──────────────────────────────────────────────────

  it("falls back to raw_html when JSON parsing fails", () => {
    const result = extractWebPageBody("{not valid json}", {});
    assert.strictEqual(result.detected, "raw_html");
    assert.strictEqual(result.body, "{not valid json}");
  });

  it("returns empty raw_html for empty input", () => {
    const result = extractWebPageBody("", {});
    assert.strictEqual(result.detected, "raw_html");
    assert.strictEqual(result.body, "");
  });
});
