/**
 * Agent Output Markdown Contract
 *
 * All agent-to-agent handoffs MUST conform to this schema:
 *
 *   ---
 *   run_id: "<uuid>"
 *   agent_name: "strategist"
 *   tone_mode: "work"
 *   brand: "llif"
 *   created_at: "<ISO string>"
 *   ---
 *
 *   # <Title>
 *
 *   ## Summary
 *   ## Inputs
 *   ## Outputs
 *   ## Notes
 *   ## Next Actions
 *
 * HTML is forbidden in all sections. Markdown-to-HTML conversion happens
 * ONLY at the publishing boundary (web-renderer / WP publisher).
 */

// ── Constants ─────────────────────────────────────────────────────────────────

export const REQUIRED_FRONTMATTER_FIELDS = [
  "run_id",
  "agent_name",
  "tone_mode",
  "brand",
  "created_at",
] as const;

/** Required H2 sections — MUST appear exactly once, in this order. */
export const REQUIRED_SECTIONS = [
  "Summary",
  "Inputs",
  "Outputs",
  "Notes",
  "Next Actions",
] as const;

export type RequiredSection = (typeof REQUIRED_SECTIONS)[number];

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AgentOutputFrontmatter {
  run_id: string;
  agent_name: string;
  tone_mode: string;
  brand: string;
  created_at: string;
  // Optional fields
  step?: string;
  inputs_ref?: string;
  output_format?: string;
  [key: string]: string | undefined;
}

export interface ParsedAgentOutput {
  frontmatter: AgentOutputFrontmatter;
  title: string;
  sections: Record<string, string>;
  raw: string;
}

export interface BuildAgentOutputOptions {
  runId: string;
  agentName: string;
  toneMode: string;
  brand: string;
  title: string;
  summary: string;
  inputs: string;
  outputs: string;
  notes: string;
  nextActions: string;
  createdAt?: string;
  step?: string;
  inputsRef?: string;
}

// ── Builder ───────────────────────────────────────────────────────────────────

/**
 * Produce a valid Agent Output Markdown document.
 */
export function buildAgentOutputMarkdown(opts: BuildAgentOutputOptions): string {
  const createdAt = opts.createdAt ?? new Date().toISOString();

  const fmLines = [
    `---`,
    `run_id: "${opts.runId}"`,
    `agent_name: "${opts.agentName}"`,
    `tone_mode: "${opts.toneMode}"`,
    `brand: "${opts.brand}"`,
    `created_at: "${createdAt}"`,
    ...(opts.step ? [`step: "${opts.step}"`] : []),
    ...(opts.inputsRef ? [`inputs_ref: "${opts.inputsRef}"`] : []),
    `output_format: "markdown"`,
    `---`,
  ];

  const bodyLines = [
    fmLines.join("\n"),
    "",
    `# ${opts.title}`,
    "",
    `## Summary`,
    opts.summary,
    "",
    `## Inputs`,
    opts.inputs,
    "",
    `## Outputs`,
    opts.outputs,
    "",
    `## Notes`,
    opts.notes,
    "",
    `## Next Actions`,
    opts.nextActions,
  ];

  return bodyLines.join("\n");
}

// ── Parser ────────────────────────────────────────────────────────────────────

/**
 * Parse an Agent Output Markdown document.
 * Returns null if the frontmatter delimiter is missing entirely.
 */
export function parseAgentOutputMarkdown(markdown: string): ParsedAgentOutput | null {
  const normalized = markdown.replace(/\r\n/g, "\n");

  // Frontmatter must start at the very beginning
  if (!normalized.startsWith("---\n")) return null;

  const endIdx = normalized.indexOf("\n---\n", 4);
  if (endIdx === -1) return null;

  const fmRaw = normalized.slice(4, endIdx);
  const body = normalized.slice(endIdx + 5); // skip "\n---\n"

  const frontmatter = parseFrontmatter(fmRaw);
  const title = extractH1(body);
  const sections = extractSections(body);

  return { frontmatter, title, sections, raw: markdown };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function parseFrontmatter(raw: string): AgentOutputFrontmatter {
  const result: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    if (!key) continue;
    let value = line.slice(colonIdx + 1).trim();
    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result as AgentOutputFrontmatter;
}

function extractH1(body: string): string {
  for (const line of body.split("\n")) {
    const m = line.match(/^#\s+(.+)$/);
    if (m) return m[1].trim();
  }
  return "";
}

/**
 * Split on H2 boundaries and return a map of { heading → content }.
 * Ignores H3+ nested headings (they become part of the section content).
 */
function extractSections(body: string): Record<string, string> {
  const sections: Record<string, string> = {};
  // Split on lines that are exactly "## heading"
  const parts = body.split(/\n(?=##\s)/);
  for (const part of parts) {
    const m = part.match(/^##\s+(.+)\n?([\s\S]*)$/);
    if (!m) continue;
    const heading = m[1].trim();
    const content = m[2].trim();
    sections[heading] = content;
  }
  return sections;
}
