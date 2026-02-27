// ── Agent Gateway ──
// Server-side bridge between the portal and the agent Express servers.

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
  /** Override base URL (e.g. "http://remote-host"). Falls back to AGENT_HOST env or http://localhost. */
  baseUrl?: string;
  port: number;
  endpoint: string;
  pipeline: "campaign" | "web" | "both" | "video";
  pipelineOrder: number;
  inputFields: FieldDef[];
  supportsFiles: boolean;
}

// ── Marketing Ops Ecosystem Config ────────────────────────────────────────────

export type BrandMode = "LLIF" | "BestLife";
export type PhaseMode = 1 | 2 | 3 | 4 | 5;

export interface MarketingOpsConfig {
  brandMode: BrandMode;              // "LLIF" | "BestLife"
  phaseMode: PhaseMode;              // 1..5
  enforceSitemapValidation: boolean;  // block invalid routes
  enforceCampaignBoilerplate: boolean;// require Campaign Outline sections
  enforcePrivacyLanguage: boolean;    // require stewardship + controls language
  enforceMarkdownContract: boolean;   // single H1, no HTML, required sections
  defaultRoute?: string;             // optional, used by web agents
}

/**
 * Central, ecosystem-aware defaults.
 * You can override per-request by passing opts from the UI (recommended).
 */
export const MARKETING_OPS_DEFAULTS: MarketingOpsConfig = {
  brandMode: (process.env.MOPS_BRAND_MODE as BrandMode) ?? "LLIF",
  phaseMode: (Number(process.env.MOPS_PHASE_MODE ?? 3) as PhaseMode) ?? 3,
  enforceSitemapValidation: true,
  enforceCampaignBoilerplate: true,
  enforcePrivacyLanguage: true,
  enforceMarkdownContract: true,
  defaultRoute: process.env.MOPS_DEFAULT_ROUTE ?? "/news",
};

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
      { name: "auditMode", label: "Audit Mode", type: "select", required: false, options: ["full_site", "single_page"] },
      { name: "pageUrl", label: "Single Page URL (single_page mode)", type: "text", required: false },
      { name: "domain", label: "Domain (full_site mode — auto-discovers pages)", type: "text", required: false },
      { name: "pageUrls", label: "Page URLs, one per line (full_site mode)", type: "textarea", required: false },
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
  "marketing-video-producer": {
    key: "marketing-video-producer",
    label: "Video Producer",
    description: "Validates video briefs against safety gates and generates xAI Imagine Video prompts",
    port: 3008,
    endpoint: "/api/compile",
    pipeline: "video",
    pipelineOrder: 1,
    supportsFiles: false,
    inputFields: [
      { name: "campaign_id", label: "Campaign ID",     type: "text",     required: true  },
      { name: "brand",       label: "Brand",           type: "select",   required: true,  options: ["llif", "bestlife"] },
      { name: "brief",       label: "Creative Brief",  type: "textarea", required: true  },
      { name: "channels",    label: "Channels (JSON)", type: "textarea", required: false },
      { name: "variants",    label: "Variants (JSON)", type: "textarea", required: true  },
      { name: "notes",       label: "Notes",           type: "textarea", required: false },
    ],
  },
};

export const AGENT_LIST = Object.values(AGENTS);

/**
 * Return agents for the given pipeline, sorted by pipelineOrder.
 * Agents with pipeline "both" appear in every non-"video" pipeline.
 */
export function getAgentsByPipeline(pipeline: AgentConfig["pipeline"]): AgentConfig[] {
  return AGENT_LIST
    .filter((a) => a.pipeline === pipeline || (pipeline !== "video" && a.pipeline === "both"))
    .sort((a, b) => a.pipelineOrder - b.pipelineOrder);
}

// Backward-compatible named exports — derived from the helper.
export const CAMPAIGN_PIPELINE = getAgentsByPipeline("campaign");
export const WEB_PIPELINE = getAgentsByPipeline("web");

// ── URL builder ──────────────────────────────────────────────────────────────

function agentBaseUrl(agent: AgentConfig): string {
  const host = agent.baseUrl ?? process.env.AGENT_HOST ?? "http://localhost";
  return `${host.replace(/\/$/, "")}:${agent.port}`;
}

// ── Execute an agent ──────────────────────────────────────────────────────────

export interface ExecuteResult {
  ok: boolean;
  result?: string;
  error?: string;
  durationMs: number;
}

export interface FileAttachment {
  filename: string;
  buffer: Buffer;
  mimeType: string;
}

function withMarketingOpsConfig(
  inputs: Record<string, string>,
  cfg?: Partial<MarketingOpsConfig>
): Record<string, string> {
  const merged: MarketingOpsConfig = { ...MARKETING_OPS_DEFAULTS, ...(cfg ?? {}) };

  // Pass as a single JSON field so agents can parse it consistently.
  // (Safer than lots of separate fields and avoids UI field clutter.)
  return {
    ...inputs,
    marketingOpsConfig: JSON.stringify(merged),
  };
}

export async function executeAgent(
  agentKey: string,
  inputs: Record<string, string>,
  files?: FileAttachment[],
  opts?: { providerId?: string; marketingOpsConfig?: Partial<MarketingOpsConfig> }
): Promise<ExecuteResult> {
  const agent = AGENTS[agentKey];
  if (!agent) throw new Error(`Unknown agent: ${agentKey}`);

  const providerParam = opts?.providerId
    ? `?provider=${encodeURIComponent(opts.providerId)}`
    : "";
  const url = `${agentBaseUrl(agent)}${agent.endpoint}${providerParam}`;
  const startTime = Date.now();

  const finalInputs =
  agent.pipeline === "campaign" || agent.pipeline === "web" || agent.pipeline === "both"
    ? withMarketingOpsConfig(inputs, opts?.marketingOpsConfig)
    : inputs;
    
  try {
    let response: Response;

    if (files && files.length > 0 && agent.supportsFiles) {
      // Send as multipart FormData when files are present
      const formData = new FormData();
      for (const [key, value] of Object.entries(finalInputs)) {
        if (value) formData.append(key, value);
      }
      for (const file of files) {
        const uint8 = new Uint8Array(file.buffer);
        const blob = new Blob([uint8], { type: file.mimeType });
        formData.append("files", blob, file.filename);
      }
      response = await fetch(url, { method: "POST", body: formData });
    } else {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(finalInputs),
      });
    }

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

// ── Health check ─────────────────────────────────────────────────────────────

export async function checkAgentHealth(): Promise<Record<string, boolean>> {
  const results: Record<string, boolean> = {};

  await Promise.allSettled(
    AGENT_LIST.map(async (agent) => {
      try {
        const res = await fetch(`${agentBaseUrl(agent)}/`, {
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
