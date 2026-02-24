/**
 * Unit tests for the Agent Output Markdown Contract validator.
 * Framework: node:test (same as all other portal tests).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildAgentOutputMarkdown,
  parseAgentOutputMarkdown,
  REQUIRED_SECTIONS,
} from "../src/lib/agentOutput/contract";
import {
  validateAgentOutputMarkdown,
  assertValidAgentOutputMarkdown,
  normalizeAgentOutputMarkdown,
  detectHtmlTags,
} from "../src/lib/agentOutput/validate";

// ── Helper: build a minimal valid document ────────────────────────────────────

function validDoc(overrides: Partial<Parameters<typeof buildAgentOutputMarkdown>[0]> = {}): string {
  return buildAgentOutputMarkdown({
    runId: "run_2026_02_24_001",
    agentName: "strategist",
    toneMode: "work",
    brand: "llif",
    title: "Campaign Strategy: Sleep Score Sneak Peek",
    summary: "Define the campaign objective and audience.",
    inputs: "- Feature: Sleep Score\n- Channel targets: Website, X, LinkedIn",
    outputs: "- Primary message\n- CTA\n- Required assets list",
    notes: "- Avoid roadmap leakage.\n- Keep privacy framing structural.",
    nextActions: "- Compiler: generate drafts per channel using this strategy.",
    createdAt: "2026-02-24T13:05:22.123Z",
    ...overrides,
  });
}

// ── A1: buildAgentOutputMarkdown + parseAgentOutputMarkdown ───────────────────

describe("buildAgentOutputMarkdown", () => {
  it("produces a document that starts with frontmatter", () => {
    const doc = validDoc();
    assert.ok(doc.startsWith("---\n"), "Should start with frontmatter delimiter");
  });

  it("includes all required frontmatter fields", () => {
    const doc = validDoc();
    assert.ok(doc.includes('run_id: "run_2026_02_24_001"'));
    assert.ok(doc.includes('agent_name: "strategist"'));
    assert.ok(doc.includes('tone_mode: "work"'));
    assert.ok(doc.includes('brand: "llif"'));
    assert.ok(doc.includes('created_at: "2026-02-24T13:05:22.123Z"'));
  });

  it("includes all five required H2 sections", () => {
    const doc = validDoc();
    for (const section of REQUIRED_SECTIONS) {
      assert.ok(doc.includes(`## ${section}`), `Missing section: ## ${section}`);
    }
  });

  it("includes exactly one H1", () => {
    const doc = validDoc();
    const h1Count = (doc.match(/^# /gm) || []).length;
    assert.strictEqual(h1Count, 1);
  });

  it("optional step and inputs_ref appear when provided", () => {
    const doc = buildAgentOutputMarkdown({
      runId: "r1", agentName: "editor", toneMode: "work", brand: "llif",
      title: "T", summary: "S", inputs: "I", outputs: "O", notes: "N", nextActions: "NA",
      step: "editor", inputsRef: "prev-step-output.md",
    });
    assert.ok(doc.includes('step: "editor"'));
    assert.ok(doc.includes('inputs_ref: "prev-step-output.md"'));
  });
});

describe("parseAgentOutputMarkdown", () => {
  it("returns null for empty string", () => {
    assert.strictEqual(parseAgentOutputMarkdown(""), null);
  });

  it("returns null when frontmatter is missing", () => {
    assert.strictEqual(parseAgentOutputMarkdown("# Just a heading\n## Summary\nfoo"), null);
  });

  it("parses a valid document", () => {
    const doc = validDoc();
    const parsed = parseAgentOutputMarkdown(doc);
    assert.ok(parsed !== null, "Should parse successfully");
    assert.strictEqual(parsed!.frontmatter.run_id, "run_2026_02_24_001");
    assert.strictEqual(parsed!.frontmatter.agent_name, "strategist");
    assert.strictEqual(parsed!.title, "Campaign Strategy: Sleep Score Sneak Peek");
  });

  it("extracts all five required sections", () => {
    const doc = validDoc();
    const parsed = parseAgentOutputMarkdown(doc);
    for (const section of REQUIRED_SECTIONS) {
      assert.ok(
        section in parsed!.sections,
        `Section "${section}" not found in parsed.sections`
      );
    }
  });

  it("preserves section content", () => {
    const doc = validDoc();
    const parsed = parseAgentOutputMarkdown(doc);
    assert.ok(parsed!.sections["Summary"].includes("campaign objective"));
    assert.ok(parsed!.sections["Notes"].includes("roadmap"));
  });
});

// ── A2: validateAgentOutputMarkdown ──────────────────────────────────────────

describe("validateAgentOutputMarkdown — valid document", () => {
  it("passes a well-formed document", () => {
    const { ok, errors } = validateAgentOutputMarkdown(validDoc());
    assert.ok(ok, `Expected ok but got errors: ${errors.join("; ")}`);
    assert.deepStrictEqual(errors, []);
  });
});

describe("validateAgentOutputMarkdown — frontmatter checks", () => {
  it("fails when frontmatter is absent", () => {
    const md = "# Title\n\n## Summary\n## Inputs\n## Outputs\n## Notes\n## Next Actions";
    const { ok, errors } = validateAgentOutputMarkdown(md);
    assert.ok(!ok);
    assert.ok(errors.some((e) => e.includes("frontmatter")));
  });

  it("fails when frontmatter is unclosed", () => {
    const md = "---\nrun_id: \"r1\"\n# Title\n## Summary\n## Inputs\n## Outputs\n## Notes\n## Next Actions";
    const { ok, errors } = validateAgentOutputMarkdown(md);
    assert.ok(!ok);
    assert.ok(errors.some((e) => e.includes("frontmatter")));
  });

  it("fails when a required frontmatter field is missing", () => {
    // Omit 'brand'
    const doc = validDoc().replace(/^brand: .+$/m, "");
    const { ok, errors } = validateAgentOutputMarkdown(doc);
    assert.ok(!ok);
    assert.ok(errors.some((e) => e.includes('"brand"')));
  });

  it("fails when created_at is not ISO format", () => {
    const doc = validDoc().replace(
      /created_at: ".+"/,
      'created_at: "Feb 24, 2026"'
    );
    const { ok, errors } = validateAgentOutputMarkdown(doc);
    assert.ok(!ok);
    assert.ok(errors.some((e) => e.includes("created_at")));
  });
});

describe("validateAgentOutputMarkdown — H1 checks", () => {
  it("fails when H1 is missing", () => {
    // Remove the H1 line
    const doc = validDoc().replace(/^# .+$/m, "");
    const { ok, errors } = validateAgentOutputMarkdown(doc);
    assert.ok(!ok);
    assert.ok(errors.some((e) => e.includes("H1")));
  });

  it("fails when there are multiple H1 headings", () => {
    const doc = validDoc().replace(
      "## Summary",
      "# Extra H1 — BAD\n\n## Summary"
    );
    const { ok, errors } = validateAgentOutputMarkdown(doc);
    assert.ok(!ok);
    assert.ok(errors.some((e) => e.includes("H1")));
  });
});

describe("validateAgentOutputMarkdown — required section checks", () => {
  it("fails when a required section is missing", () => {
    const doc = validDoc().replace(/^## Outputs[\s\S]*?(?=^## )/m, "");
    const { ok, errors } = validateAgentOutputMarkdown(doc);
    assert.ok(!ok);
    assert.ok(errors.some((e) => e.includes('"## Outputs"')));
  });

  it("fails when a section appears twice", () => {
    const doc = validDoc() + "\n## Summary\nDuplicate summary here.";
    const { ok, errors } = validateAgentOutputMarkdown(doc);
    assert.ok(!ok);
    assert.ok(errors.some((e) => e.includes("Summary") && e.includes("times")));
  });

  it("fails when required sections are out of order", () => {
    // Swap Inputs and Summary
    const doc = validDoc()
      .replace("## Summary\n", "##TEMP_SUMMARY\n")
      .replace("## Inputs\n", "## Summary\n")
      .replace("##TEMP_SUMMARY\n", "## Inputs\n");
    const { ok, errors } = validateAgentOutputMarkdown(doc);
    assert.ok(!ok);
    assert.ok(errors.some((e) => e.toLowerCase().includes("order")));
  });
});

describe("validateAgentOutputMarkdown — HTML rejection", () => {
  it("fails when raw <div> appears in body", () => {
    const doc = validDoc().replace(
      "Define the campaign objective",
      "<div>Define the campaign objective</div>"
    );
    const { ok, errors } = validateAgentOutputMarkdown(doc);
    assert.ok(!ok);
    assert.ok(errors.some((e) => e.includes("<div>")));
  });

  it("fails when <p> tags appear in body", () => {
    const doc = validDoc().replace(
      "Define the campaign objective",
      "<p>Define the campaign objective</p>"
    );
    const { ok, errors } = validateAgentOutputMarkdown(doc);
    assert.ok(!ok);
    assert.ok(errors.some((e) => e.includes("<p>")));
  });

  it("fails when <br> appears in body", () => {
    const doc = validDoc().replace("Define the campaign", "<br>Define the campaign");
    const { ok, errors } = validateAgentOutputMarkdown(doc);
    assert.ok(!ok);
    assert.ok(errors.some((e) => e.includes("<br>")));
  });

  it("fails when <h1> tag appears in body", () => {
    const doc = validDoc().replace("- Avoid roadmap", "<h1>Avoid roadmap</h1>");
    const { ok, errors } = validateAgentOutputMarkdown(doc);
    assert.ok(!ok);
    assert.ok(errors.some((e) => e.includes("<h1>")));
  });

  it("allows HTML inside fenced code blocks", () => {
    const doc = validDoc().replace(
      "- Primary message",
      "- Primary message\n\n```html\n<div class=\"hero\">Example</div>\n```"
    );
    const { ok, errors } = validateAgentOutputMarkdown(doc);
    assert.ok(ok, `HTML inside code fence should be allowed. Errors: ${errors.join("; ")}`);
  });

  it("allows markdown auto-links like <https://example.com>", () => {
    const doc = validDoc().replace(
      "- Compiler: generate drafts",
      "- See <https://example.com> for context"
    );
    // Auto-links are explicitly excluded from the HTML detector
    const tagErrors = detectHtmlTags(doc);
    assert.ok(
      !tagErrors.some((e) => e.includes("https")),
      `Auto-link should not be flagged as HTML`
    );
  });

  it("allows HTML only in inline code", () => {
    // Inline code: `<div>` should be exempt
    const doc = validDoc().replace(
      "- Avoid roadmap",
      "- Avoid `<div>` wrappers in the output"
    );
    const { ok } = validateAgentOutputMarkdown(doc);
    assert.ok(ok, "Inline code content should be exempt from HTML check");
  });
});

// ── normalizeAgentOutputMarkdown ──────────────────────────────────────────────

describe("normalizeAgentOutputMarkdown", () => {
  it("converts CRLF to LF", () => {
    const doc = validDoc().replace(/\n/g, "\r\n");
    const normalized = normalizeAgentOutputMarkdown(doc);
    assert.ok(!normalized.includes("\r\n"), "Should not contain CRLF after normalization");
  });

  it("strips trailing whitespace from lines", () => {
    const doc = validDoc().replace("## Summary", "## Summary   ");
    const normalized = normalizeAgentOutputMarkdown(doc);
    assert.ok(!/ +$/m.test(normalized), "Should not have trailing spaces");
  });

  it("produces stable output when called twice", () => {
    const doc = validDoc();
    const once = normalizeAgentOutputMarkdown(doc);
    const twice = normalizeAgentOutputMarkdown(once);
    assert.strictEqual(once, twice, "normalization should be idempotent");
  });

  it("ends with exactly one newline", () => {
    const doc = validDoc() + "\n\n\n";
    const normalized = normalizeAgentOutputMarkdown(doc);
    assert.ok(normalized.endsWith("\n"), "Should end with newline");
    assert.ok(!normalized.endsWith("\n\n"), "Should end with exactly one newline");
  });
});

// ── assertValidAgentOutputMarkdown ───────────────────────────────────────────

describe("assertValidAgentOutputMarkdown", () => {
  it("returns parsed output for a valid document", () => {
    const doc = validDoc();
    const parsed = assertValidAgentOutputMarkdown(doc);
    assert.ok(parsed.frontmatter.run_id === "run_2026_02_24_001");
  });

  it("throws with readable error list on invalid document", () => {
    const doc = "# No frontmatter here";
    try {
      assertValidAgentOutputMarkdown(doc);
      assert.fail("Expected to throw");
    } catch (err) {
      assert.ok(err instanceof Error);
      assert.ok((err as Error).message.includes("frontmatter"));
    }
  });
});
