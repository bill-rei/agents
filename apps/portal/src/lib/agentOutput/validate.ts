/**
 * Markdown Contract Validator
 *
 * Validates that an agent output Markdown document conforms to the contract
 * defined in contract.ts. All checks are pure string operations — no DB, no I/O.
 *
 * Usage:
 *   const { ok, errors, warnings, parsed } = validateAgentOutputMarkdown(md);
 *   const parsed = assertValidAgentOutputMarkdown(md); // throws on failure
 */

import {
  parseAgentOutputMarkdown,
  REQUIRED_FRONTMATTER_FIELDS,
  REQUIRED_SECTIONS,
  type ParsedAgentOutput,
  type RequiredSection,
} from "./contract";

// ── Result types ──────────────────────────────────────────────────────────────

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  parsed?: ParsedAgentOutput;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Validate the Markdown contract. Returns { ok, errors, warnings, parsed }.
 * Never throws.
 */
export function validateAgentOutputMarkdown(markdown: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!markdown || typeof markdown !== "string") {
    return { ok: false, errors: ["Input is empty or not a string"], warnings };
  }

  // ── 1. Frontmatter present + parseable ──────────────────────────────────────
  const parsed = parseAgentOutputMarkdown(markdown);
  if (!parsed) {
    errors.push(
      "Missing or malformed YAML frontmatter. Document must start with --- and close with ---."
    );
    return { ok: false, errors, warnings };
  }

  // ── 2. Required frontmatter fields ─────────────────────────────────────────
  for (const field of REQUIRED_FRONTMATTER_FIELDS) {
    const val = parsed.frontmatter[field];
    if (!val || String(val).trim() === "") {
      errors.push(`Frontmatter missing required field: "${field}"`);
    }
  }

  // created_at must look like an ISO string
  const { created_at } = parsed.frontmatter;
  if (created_at && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(created_at)) {
    errors.push(
      `Frontmatter "created_at" must be an ISO 8601 datetime string (got: "${created_at}")`
    );
  }

  // ── 3. Exactly one H1 in the document body ─────────────────────────────────
  const body = stripFrontmatter(markdown);
  const h1Matches = [...body.matchAll(/^#\s+.+$/gm)];
  if (h1Matches.length === 0) {
    errors.push('Document body must contain exactly one H1 heading ("# Title").');
  } else if (h1Matches.length > 1) {
    errors.push(
      `Document body must contain exactly one H1 heading, found ${h1Matches.length}.`
    );
  }

  // ── 4. Required H2 sections — exist exactly once and in correct order ───────
  const h2Headings = extractH2Headings(body);
  const sectionErrors = validateSections(h2Headings);
  errors.push(...sectionErrors);

  // ── 5. No raw HTML tags (outside of fenced code blocks) ────────────────────
  const htmlErrors = detectHtmlTags(body);
  errors.push(...htmlErrors);

  // ── Warnings: minor style issues ───────────────────────────────────────────
  if (/[ \t]+$/m.test(body)) {
    warnings.push("Document contains trailing whitespace on one or more lines.");
  }

  // Heading not preceded by blank line
  if (/[^\n]\n#{1,6}\s/.test(body)) {
    warnings.push("One or more headings are not preceded by a blank line.");
  }

  const ok = errors.length === 0;
  return { ok, errors, warnings, parsed: ok ? parsed : undefined };
}

/**
 * Assert the document is valid. Returns the parsed output or throws an Error
 * whose message lists all validation failures.
 */
export function assertValidAgentOutputMarkdown(markdown: string): ParsedAgentOutput {
  const result = validateAgentOutputMarkdown(markdown);
  if (!result.ok) {
    throw new Error(
      `Agent output Markdown contract violation:\n` +
        result.errors.map((e) => `  • ${e}`).join("\n")
    );
  }
  // parsed is defined when ok === true
  return result.parsed!;
}

/**
 * Normalize minor formatting issues in a Markdown document.
 * Only touches whitespace; never changes content.
 */
export function normalizeAgentOutputMarkdown(markdown: string): string {
  let s = markdown.replace(/\r\n/g, "\n"); // CRLF → LF

  // Strip trailing whitespace from lines
  s = s.replace(/[ \t]+$/gm, "");

  // Ensure blank line before H1/H2 headings (but not at start of doc / after ---)
  s = s.replace(/([^\n])\n(#{1,2}\s)/g, "$1\n\n$2");

  // Normalise section spacing: ensure exactly one blank line between sections
  // (i.e. between the end of a section body and the start of the next ## heading)
  s = s.replace(/\n{3,}(##\s)/g, "\n\n$1");

  // Ensure file ends with single newline
  s = s.trimEnd() + "\n";

  return s;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function stripFrontmatter(markdown: string): string {
  const norm = markdown.replace(/\r\n/g, "\n");
  if (!norm.startsWith("---\n")) return norm;
  const end = norm.indexOf("\n---\n", 4);
  if (end === -1) return norm;
  return norm.slice(end + 5);
}

function extractH2Headings(body: string): string[] {
  const stripped = stripCodeFences(body);
  const headings: string[] = [];
  for (const line of stripped.split("\n")) {
    const m = line.match(/^##\s+(.+)$/);
    if (m) headings.push(m[1].trim());
  }
  return headings;
}

/**
 * Remove content inside fenced code blocks (```...```) and inline code (`...`)
 * before running checks that must not fire inside code examples.
 */
function stripCodeFences(text: string): string {
  // Remove fenced code blocks (triple backtick or triple tilde)
  let stripped = text.replace(/`{3}[\s\S]*?`{3}/g, "");
  // Remove indented code blocks (4-space / tab indent)
  stripped = stripped.replace(/^(?: {4}|\t).*/gm, "");
  // Remove inline code
  stripped = stripped.replace(/`[^`\n]+`/g, "");
  return stripped;
}

function validateSections(h2Headings: string[]): string[] {
  const errors: string[] = [];

  // Check each required section exists exactly once
  for (const req of REQUIRED_SECTIONS) {
    const count = h2Headings.filter((h) => h === req).length;
    if (count === 0) {
      errors.push(`Required H2 section "## ${req}" is missing.`);
    } else if (count > 1) {
      errors.push(`Required H2 section "## ${req}" appears ${count} times (must be exactly once).`);
    }
  }

  // Check order: the required sections must appear in REQUIRED_SECTIONS order
  const presentRequired = REQUIRED_SECTIONS.filter((r) => h2Headings.includes(r));
  if (presentRequired.length > 1) {
    const indices = presentRequired.map((s) => h2Headings.indexOf(s));
    const outOfOrder = indices.some((idx, i) => i > 0 && idx < indices[i - 1]);
    if (outOfOrder) {
      errors.push(
        `Required sections are out of order. Expected order: ${REQUIRED_SECTIONS.map((s) => `"${s}"`).join(", ")}.`
      );
    }
  }

  return errors;
}

/**
 * Detect raw HTML tags in the document body (after stripping code fences).
 *
 * Allowed: markdown auto-links like <https://example.com>
 * Specifically rejected:
 *   - <p>, <br>, <div>, <span>, <h1>–<h6> and any closing variants
 *   - <ul>, <ol>, <li>, <table>, <td>, <th>, etc.
 *   - Any tag with attributes: <a href=...>, <img src=...>
 */
export function detectHtmlTags(body: string): string[] {
  const stripped = stripCodeFences(body);
  const errors: string[] = [];
  const seen = new Set<string>();

  // Match HTML tags: <tagname>, </tagname>, <tagname ...>, <tagname/>
  // Exclude auto-links: <http://...> <https://...> <mailto:...>
  const HTML_TAG_RE =
    /<\/?(?!https?:\/\/|mailto:)[a-zA-Z][a-zA-Z0-9]*(?:\s[^>]*)?\s*\/?>/g;

  for (const match of stripped.matchAll(HTML_TAG_RE)) {
    const tag = match[0];
    const tagName = tag.match(/^<\/?([a-zA-Z][a-zA-Z0-9]*)/)?.[1]?.toLowerCase();
    if (!tagName || seen.has(tagName)) continue;
    seen.add(tagName);
    errors.push(
      `Raw HTML tag detected: <${tagName}>. HTML is forbidden in agent outputs. ` +
        `Use Markdown equivalents. (HTML is only permitted inside fenced code blocks.)`
    );
  }

  return errors;
}

// ── Named re-export so tests can import the section validator directly ────────
export { REQUIRED_SECTIONS, type RequiredSection };
