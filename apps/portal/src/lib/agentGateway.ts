// ── Agent Gateway ──
// Server-side bridge between the portal and the 8 agent Express servers.

export type FieldType = "text" | "textarea" | "select";

export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  required: boolean;
  fromAgent?: string; // upstream agent whose output can auto-populate this field
  options?: string[]; // for select fields
}

export interface AgentConfig {
  key: string;
  label: string;
  description: string;
  port: number;
  endpoint: string;
  pipeline: "campaign" | "web" | "both";
  pipelineOrder: number;
  inputFields: FieldDef[];
  supportsFiles: boolean;
}

export const AGENTS: Record<string, AgentConfig> = {
  strategist: {
    key: "strategist",
    label: "Strategist",
    description: "Decides what campaign to run next based on GTM priorities and constraints",
    port: 3003,
    endpoint: "/api/compile",
    pipeline: "both",
    pipelineOrder: 1,
    supportsFiles: true,
    inputFields: [
      { name: "gtmPriorities", label: "GTM Priorities", type: "textarea", required: false },
      { name: "releaseContext", label: "Release Context", type: "textarea", required: false },
      { name: "campaignBacklog", label: "Campaign Backlog", type: "textarea", required: false },
      { name: "auditSummary", label: "Audit Summary", type: "textarea", required: false, fromAgent: "site-auditor" },
      { name: "constraints", label: "Constraints", type: "textarea", required: false },
      { name: "referenceDocs", label: "Reference Docs", type: "textarea", required: false },
    ],
  },
  "marketing-compiler": {
    key: "marketing-compiler",
    label: "Compiler",
    description: "Compiles structured inputs into complete marketing campaign drafts",
    port: 3000,
    endpoint: "/api/compile",
    pipeline: "campaign",
    pipelineOrder: 2,
    supportsFiles: true,
    inputFields: [
      { name: "campaignTitle", label: "Campaign Title", type: "text", required: false },
      { name: "campaignTheme", label: "Campaign Theme", type: "text", required: false, fromAgent: "strategist" },
      { name: "primaryPersona", label: "Primary Persona", type: "text", required: false, fromAgent: "strategist" },
      { name: "useCase", label: "Use Case", type: "text", required: false },
      { name: "releaseContext", label: "Release Context", type: "textarea", required: false },
      { name: "notes", label: "Notes", type: "textarea", required: false },
      { name: "outputMode", label: "Output Mode", type: "select", required: false, options: ["narrative_structure", "web_page_copy"] },
      { name: "siteAuditInput", label: "Site Audit Input", type: "textarea", required: false, fromAgent: "site-auditor" },
      { name: "referenceDocs", label: "Reference Docs", type: "textarea", required: false },
    ],
  },
  editor: {
    key: "editor",
    label: "Editor",
    description: "Improves clarity, quality, and channel-fit of campaign assets",
    port: 3001,
    endpoint: "/api/compile",
    pipeline: "campaign",
    pipelineOrder: 3,
    supportsFiles: true,
    inputFields: [
      { name: "campaignAssets", label: "Campaign Assets", type: "textarea", required: false, fromAgent: "marketing-compiler" },
      { name: "auditFindings", label: "Audit Findings", type: "textarea", required: false, fromAgent: "site-auditor" },
      { name: "notes", label: "Editor Notes", type: "textarea", required: false },
      { name: "referenceDocs", label: "Reference Docs", type: "textarea", required: false },
    ],
  },
  distributor: {
    key: "distributor",
    label: "Distributor",
    description: "Prepares finalized assets for distribution per channel norms",
    port: 3004,
    endpoint: "/api/compile",
    pipeline: "campaign",
    pipelineOrder: 4,
    supportsFiles: true,
    inputFields: [
      { name: "editedAssets", label: "Edited Assets", type: "textarea", required: false, fromAgent: "editor" },
      { name: "channels", label: "Target Channels", type: "textarea", required: false },
      { name: "constraints", label: "Constraints", type: "textarea", required: false },
      { name: "referenceDocs", label: "Reference Docs", type: "textarea", required: false },
    ],
  },
  optimizer: {
    key: "optimizer",
    label: "Optimizer",
    description: "Analyzes post-distribution signals, translates into upstream learnings",
    port: 3005,
    endpoint: "/api/compile",
    pipeline: "campaign",
    pipelineOrder: 6,
    supportsFiles: true,
    inputFields: [
      { name: "campaignMeta", label: "Campaign Metadata", type: "textarea", required: false },
      { name: "platformMetrics", label: "Platform Metrics", type: "textarea", required: false },
      { name: "qualitativeFeedback", label: "Qualitative Feedback", type: "textarea", required: false },
      { name: "humanNotes", label: "Human Notes", type: "textarea", required: false },
      { name: "referenceDocs", label: "Reference Docs", type: "textarea", required: false },
    ],
  },
  "site-auditor": {
    key: "site-auditor",
    label: "Site Auditor",
    description: "Crawls and evaluates live website content against brand/product reality",
    port: 3002,
    endpoint: "/api/compile",
    pipeline: "web",
    pipelineOrder: 2,
    supportsFiles: true,
    inputFields: [
      { name: "domain", label: "Domain", type: "text", required: false },
      { name: "pageUrls", label: "Page URLs (comma-separated)", type: "textarea", required: false },
      { name: "audienceSegments", label: "Audience Segments", type: "textarea", required: false },
      { name: "notes", label: "Operator Notes", type: "textarea", required: false },
      { name: "referenceDocs", label: "Reference Docs", type: "textarea", required: false },
    ],
  },
  "website-messaging-architect": {
    key: "website-messaging-architect",
    label: "Messaging Architect",
    description: "Transforms page audits and strategy into deployable web page copy",
    port: 3006,
    endpoint: "/api/compile",
    pipeline: "web",
    pipelineOrder: 3,
    supportsFiles: true,
    inputFields: [
      { name: "pageName", label: "Page Name", type: "text", required: true },
      { name: "siteAuditInput", label: "Site Audit Output", type: "textarea", required: true, fromAgent: "site-auditor" },
      { name: "strategistTheme", label: "Theme (from Strategist)", type: "text", required: false, fromAgent: "strategist" },
      { name: "strategistPersona", label: "Persona (from Strategist)", type: "text", required: false, fromAgent: "strategist" },
      { name: "strategistScope", label: "Scope (from Strategist)", type: "textarea", required: false, fromAgent: "strategist" },
      { name: "strategistExclusions", label: "Exclusions", type: "textarea", required: false },
      { name: "referenceDocs", label: "Reference Docs (SSOT)", type: "textarea", required: false },
    ],
  },
  "web-renderer": {
    key: "web-renderer",
    label: "Web Renderer",
    description: "Converts structured web copy into clean semantic HTML for WordPress",
    port: 3007,
    endpoint: "/api/compile",
    pipeline: "web",
    pipelineOrder: 4,
    supportsFiles: false,
    inputFields: [
      { name: "rawCopy", label: "Raw Copy", type: "textarea", required: true, fromAgent: "website-messaging-architect" },
      { name: "pageName", label: "Page Name", type: "text", required: true },
      { name: "constraints", label: "Rendering Constraints", type: "textarea", required: false },
      { name: "renderProfile", label: "Render Profile", type: "text", required: false },
    ],
  },
};

export const AGENT_LIST = Object.values(AGENTS);

export const CAMPAIGN_PIPELINE = AGENT_LIST
  .filter((a) => a.pipeline === "campaign" || a.pipeline === "both")
  .sort((a, b) => a.pipelineOrder - b.pipelineOrder);

export const WEB_PIPELINE = AGENT_LIST
  .filter((a) => a.pipeline === "web" || a.pipeline === "both")
  .sort((a, b) => a.pipelineOrder - b.pipelineOrder);

// ── Execute an agent ──

export interface ExecuteResult {
  ok: boolean;
  result?: string;
  error?: string;
  durationMs: number;
}

export async function executeAgent(
  agentKey: string,
  inputs: Record<string, string>
): Promise<ExecuteResult> {
  const agent = AGENTS[agentKey];
  if (!agent) throw new Error(`Unknown agent: ${agentKey}`);

  const url = `http://localhost:${agent.port}${agent.endpoint}`;
  const startTime = Date.now();

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(inputs),
    });

    const durationMs = Date.now() - startTime;

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      return {
        ok: false,
        error: (errBody as Record<string, string>).error || `HTTP ${response.status}`,
        durationMs,
      };
    }

    const data = await response.json();
    // web-renderer returns { content: { html } }, all others return { result }
    const result =
      typeof data.result === "string"
        ? data.result
        : JSON.stringify(data, null, 2);

    return { ok: true, result, durationMs };
  } catch (err) {
    return {
      ok: false,
      error: (err as Error).message,
      durationMs: Date.now() - startTime,
    };
  }
}

// ── Health check ──

export async function checkAgentHealth(): Promise<Record<string, boolean>> {
  const results: Record<string, boolean> = {};

  await Promise.allSettled(
    AGENT_LIST.map(async (agent) => {
      try {
        const res = await fetch(`http://localhost:${agent.port}/`, {
          signal: AbortSignal.timeout(2000),
        });
        results[agent.key] = res.ok || res.status === 404; // Express returns 404 for GET / but that means it's alive
      } catch {
        results[agent.key] = false;
      }
    })
  );

  return results;
}
