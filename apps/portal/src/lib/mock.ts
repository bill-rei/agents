/**
 * Sprint 1 in-memory mock store.
 * Data resets on server restart — acceptable for local dev.
 */
import type {
  Message,
  Asset,
  AgentStep,
  AgentActivityEvent,
  Channel,
  CreateMessagePayload,
  AssetType,
  MessageStatus,
  MockRole,
  WorkflowTemplate,
  CreateWorkflowPayload,
  AgentStepName,
} from "./types";

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function now(): string {
  return new Date().toISOString();
}

function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 3_600_000).toISOString();
}

// ── Channel → asset-type mapping ─────────────────────────────────────────────

const CHANNEL_ASSET_MAP: Record<Channel, AssetType[]> = {
  linkedin: ["linkedin_post", "visual"],
  x: ["x_post", "visual"],
  newsletter: ["email"],
  community: ["blog"],
  website_git: ["website_page"],
};

function inferAssetTypes(channels: Channel[]): AssetType[] {
  const set = new Set<AssetType>();
  for (const ch of channels) {
    for (const t of CHANNEL_ASSET_MAP[ch] ?? []) set.add(t);
  }
  return [...set];
}

// ── Default pipeline ──────────────────────────────────────────────────────────

function defaultPipeline(): AgentStep[] {
  return [
    { id: uid(), name: "Strategist", state: "idle" },
    { id: uid(), name: "Compiler", state: "idle" },
    { id: uid(), name: "Editor", state: "idle" },
    { id: uid(), name: "Creative", state: "idle" },
    { id: uid(), name: "Distributor", state: "idle" },
    { id: uid(), name: "Optimizer", state: "idle" },
  ];
}

// ── Sample seed data ──────────────────────────────────────────────────────────

const SEED_MESSAGES: Message[] = [
  {
    id: "msg_seed_1",
    title: "Health is Personal, Not Prescribed",
    idea: "Share how tracking your own health patterns leads to better decisions than generic advice.",
    brand: "LLIF",
    publishMode: "schedule",
    scheduledFor: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    channels: ["linkedin", "x"],
    status: "in_review",
    createdBy: "Alex",
    createdAt: hoursAgo(5),
    pipeline: [
      { id: "p1", name: "Strategist", state: "done" },
      { id: "p2", name: "Compiler", state: "done" },
      { id: "p3", name: "Editor", state: "done" },
      { id: "p4", name: "Creative", state: "done" },
      { id: "p5", name: "Distributor", state: "idle" },
      { id: "p6", name: "Optimizer", state: "idle" },
    ],
    assets: [
      {
        id: "a1",
        type: "linkedin_post",
        status: "generated",
        contentText:
          "Your body tells a story every day — blood pressure patterns, sleep cycles, energy dips. The question isn't what's normal for everyone; it's what's normal for *you*.\n\nLLIF turns your data into your personal baseline. No prescriptions. No averages. Just insight that fits your life.\n\n#HealthIsPersonal #LLIF #WellnessTech",
        lastUpdatedAt: hoursAgo(4),
      },
      {
        id: "a2",
        type: "x_post",
        status: "generated",
        contentText:
          "Your health story is written in patterns, not point-in-time snapshots.\n\nLLIF helps you read it. 🔬 #HealthIsPersonal",
        lastUpdatedAt: hoursAgo(4),
      },
      {
        id: "a3",
        type: "visual",
        status: "generated",
        contentUrl: undefined,
        lastUpdatedAt: hoursAgo(4),
      },
    ],
    activity: [
      { id: "e1", ts: hoursAgo(4.9), agentName: "Strategist", level: "info", message: "Analyzing campaign brief and brand voice guidelines." },
      { id: "e2", ts: hoursAgo(4.8), agentName: "Strategist", level: "info", message: "Strategy complete. Key message: personal health baseline." },
      { id: "e3", ts: hoursAgo(4.7), agentName: "Compiler", level: "info", message: "Generating LinkedIn copy variant 1 of 3." },
      { id: "e4", ts: hoursAgo(4.6), agentName: "Compiler", level: "info", message: "Copy generation complete. 3 variants produced." },
      { id: "e5", ts: hoursAgo(4.5), agentName: "Editor", level: "info", message: "Reviewing copy for tone, clarity, and compliance." },
      { id: "e6", ts: hoursAgo(4.4), agentName: "Editor", level: "warn", message: "Softened one phrase that bordered on medical advice." },
      { id: "e7", ts: hoursAgo(4.3), agentName: "Creative", level: "info", message: "Generating visual assets for LinkedIn and X." },
      { id: "e8", ts: hoursAgo(4.2), agentName: "Creative", level: "info", message: "Visuals rendered. Awaiting review." },
    ],
  },
  {
    id: "msg_seed_2",
    title: "Spring Wellness Reset",
    idea: "Motivate users to start fresh with a simple 3-step wellness check-in this spring.",
    brand: "BestLife",
    publishMode: "now",
    channels: ["linkedin", "newsletter"],
    status: "draft",
    createdBy: "Jordan",
    createdAt: hoursAgo(1),
    pipeline: defaultPipeline(),
    assets: [],
    activity: [],
  },
  {
    id: "msg_seed_3",
    title: "Sleep Quality = Life Quality",
    idea: "Position sleep tracking as the most underrated wellness investment you can make.",
    brand: "LLIF",
    publishMode: "schedule",
    scheduledFor: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    channels: ["x", "community"],
    status: "scheduled",
    createdBy: "Alex",
    createdAt: hoursAgo(48),
    pipeline: [
      { id: "sp1", name: "Strategist", state: "done" },
      { id: "sp2", name: "Compiler", state: "done" },
      { id: "sp3", name: "Editor", state: "done" },
      { id: "sp4", name: "Creative", state: "done" },
      { id: "sp5", name: "Distributor", state: "done" },
      { id: "sp6", name: "Optimizer", state: "done" },
    ],
    assets: [
      {
        id: "sa1",
        type: "x_post",
        status: "generated",
        contentText: "8 hours isn't a luxury — it's infrastructure for everything else in your life. Track it. Protect it. #SleepQuality #LLIF",
        lastUpdatedAt: hoursAgo(47),
      },
      {
        id: "sa2",
        type: "blog",
        status: "generated",
        contentText: "## Sleep: The Underrated Wellness Investment\n\nWe optimize our diets, our workouts, our schedules — but sleep often gets treated as whatever's left after everything else. That's backwards.\n\nSleep is the recovery phase that makes all the other optimization possible...",
        lastUpdatedAt: hoursAgo(47),
      },
    ],
    activity: [],
  },
];

// ── In-memory store ───────────────────────────────────────────────────────────

const store = new Map<string, Message>(SEED_MESSAGES.map((m) => [m.id, m]));

// ── Public API ────────────────────────────────────────────────────────────────

export function listMessages(): Message[] {
  return [...store.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function getMessage(id: string): Message | undefined {
  return store.get(id);
}

export function createMessage(
  payload: CreateMessagePayload,
  createdBy = "You"
): Message {
  const assetTypes =
    payload.assetTypes ?? inferAssetTypes(payload.channels);

  const title =
    payload.idea.length > 60
      ? payload.idea.slice(0, 57) + "…"
      : payload.idea;

  // Use template pipeline if templateId supplied, else full default pipeline
  const pipeline: AgentStep[] = (() => {
    if (payload.templateId) {
      const tmpl = workflowStore.get(payload.templateId);
      if (tmpl) return tmpl.pipeline.map((s) => ({ ...s, id: uid(), state: "idle" as const }));
    }
    return defaultPipeline();
  })();

  const msg: Message = {
    id: `msg_${uid()}`,
    title,
    idea: payload.idea,
    brand: payload.brand,
    publishMode: payload.publishMode,
    scheduledFor: payload.scheduledFor,
    channels: payload.channels,
    status: "draft",
    createdBy,
    createdAt: now(),
    pipeline,
    templateId: payload.templateId,
    assets: assetTypes.map((type) => ({
      id: `asset_${uid()}`,
      type,
      status: "generated" as const,
      contentText: undefined,
      contentUrl: undefined,
      lastUpdatedAt: now(),
    })),
    activity: [],
  };

  store.set(msg.id, msg);
  return msg;
}

export function updateAsset(
  msgId: string,
  assetId: string,
  contentText: string
): Message | undefined {
  const msg = store.get(msgId);
  if (!msg) return undefined;
  const updated: Message = {
    ...msg,
    assets: msg.assets.map((a) =>
      a.id === assetId
        ? { ...a, contentText, status: "edited" as const, lastUpdatedAt: now() }
        : a
    ),
  };
  store.set(msgId, updated);
  return updated;
}

export function submitForReview(id: string): Message | undefined {
  const msg = store.get(id);
  if (!msg) return undefined;
  const updated: Message = { ...msg, status: "in_review" };
  store.set(id, updated);
  return updated;
}

/**
 * Governance: approval triggers publish or scheduling based on publishMode.
 * - Admin can approve their own content.
 * - Non-admin must have a different person approve.
 */
export function approveAndPublishOrSchedule(
  id: string,
  approverRole: MockRole,
  approverName: string
): { message: Message; action: "published" | "scheduled" } | { error: string } {
  const msg = store.get(id);
  if (!msg) return { error: "Message not found" };
  if (msg.status !== "in_review") return { error: "Message is not in review" };

  if (approverRole !== "admin" && approverRole !== "reviewer") {
    return { error: "Only admins or reviewers can approve" };
  }

  const newStatus: MessageStatus =
    msg.publishMode === "schedule" ? "scheduled" : "published";

  const updated: Message = {
    ...msg,
    status: newStatus,
    activity: [
      ...msg.activity,
      {
        id: uid(),
        ts: now(),
        agentName: "Distributor",
        level: "info",
        message: `${approverName} approved. ${newStatus === "published" ? "Publishing now." : `Scheduled for ${msg.scheduledFor ? new Date(msg.scheduledFor).toLocaleString() : "set time"}.`}`,
      },
    ],
  };
  store.set(id, updated);
  return { message: updated, action: newStatus === "published" ? "published" : "scheduled" };
}

export function requestEdits(id: string, note?: string): Message | undefined {
  const msg = store.get(id);
  if (!msg) return undefined;
  const updated: Message = {
    ...msg,
    status: "needs_edits",
    activity: note
      ? [
          ...msg.activity,
          {
            id: uid(),
            ts: now(),
            agentName: "Editor",
            level: "warn",
            message: `Edits requested: ${note}`,
          },
        ]
      : msg.activity,
  };
  store.set(id, updated);
  return updated;
}

export function addActivity(
  msgId: string,
  event: Omit<AgentActivityEvent, "id" | "ts">
): void {
  const msg = store.get(msgId);
  if (!msg) return;
  store.set(msgId, {
    ...msg,
    activity: [...msg.activity, { ...event, id: uid(), ts: now() }],
  });
}

export function updatePipelineStep(
  msgId: string,
  stepName: AgentStep["name"],
  state: AgentStep["state"]
): void {
  const msg = store.get(msgId);
  if (!msg) return;
  store.set(msgId, {
    ...msg,
    pipeline: msg.pipeline.map((s) =>
      s.name === stepName ? { ...s, state } : s
    ),
  });
}

export function setMessageStatus(
  msgId: string,
  status: MessageStatus
): void {
  const msg = store.get(msgId);
  if (!msg) return;
  store.set(msgId, { ...msg, status });
}

// ── Stub: simulate generation ─────────────────────────────────────────────────

/** Returns sample generated text for a given asset type + brand. */
export function getSampleContent(
  type: import("./types").AssetType,
  brand: import("./types").Brand,
  idea: string
): string {
  const brandVoice =
    brand === "LLIF"
      ? "research-informed and privacy-forward"
      : "accessible and encouraging";
  const short = idea.length > 40 ? idea.slice(0, 40) + "…" : idea;

  const samples: Record<import("./types").AssetType, string> = {
    linkedin_post: `${short}\n\nThis isn't a trend — it's a shift in how we approach ${brand === "LLIF" ? "personal health data" : "everyday wellness"}.\n\nHere's what matters: ${idea.slice(0, 80)}\n\n#${brand} #Wellness`,
    x_post: `${short}\n\n${brand === "LLIF" ? "Your data, your story. 🔬" : "Small steps, real change. 💚"} #${brand}`,
    blog: `## ${short}\n\nIn an era of information overload, ${idea.slice(0, 60)}...\n\nHere's why this matters for ${brand === "LLIF" ? "personal health tracking" : "everyday wellness"}:\n\n1. **Consistency beats perfection** — small, trackable actions compound over time.\n2. **Context is everything** — what works for someone else may not work for you.\n3. **Data empowers decisions** — knowing your patterns gives you agency.\n\nThe bottom line: ${idea}`,
    website_page: `# ${short}\n\n> ${idea}\n\n## Why It Matters\n\n${brand === "LLIF" ? "LLIF gives you the tools to understand your own health patterns." : "BestLife makes wellness achievable for everyone."}\n\n## Get Started\n\nJoin thousands who have already taken control of their wellbeing.`,
    email: `Subject: ${short}\n\nHi [First Name],\n\n${idea}\n\nWe believe ${brand === "LLIF" ? "your health story is unique to you" : "wellness should be accessible to everyone"}.\n\nThat's why we built ${brand}.\n\n→ [Learn More]\n\nWarm regards,\nThe ${brand} Team`,
    visual: `[Visual placeholder — ${brandVoice} design with key message: "${short}"]`,
  };

  return samples[type] ?? `Generated content for ${type}`;
}

// ── Workflow Template store ───────────────────────────────────────────────────

function makeStep(name: AgentStepName): AgentStep {
  return { id: uid(), name, state: "idle" };
}

function steps(...names: AgentStepName[]): AgentStep[] {
  return names.map(makeStep);
}

const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

const SEED_WORKFLOWS: WorkflowTemplate[] = [
  {
    id: "wf_linkedin_llif",
    name: "LinkedIn Only (LLIF)",
    description: "Single LinkedIn post with visual asset, tuned for LLIF's research-informed voice.",
    brand: "LLIF",
    category: "social",
    defaultPublishMode: "draft",
    defaultChannels: ["linkedin"],
    defaultAssets: ["linkedin_post", "visual"],
    pipeline: steps("Strategist", "Compiler", "Editor", "Creative", "Distributor"),
    createdBy: "system",
    createdAt: daysAgo(30),
    updatedAt: daysAgo(5),
  },
  {
    id: "wf_x_bestlife",
    name: "X Only (BestLife)",
    description: "Short-form X post with a visual, using BestLife's encouraging wellness-coach tone.",
    brand: "BestLife",
    category: "social",
    defaultPublishMode: "draft",
    defaultChannels: ["x"],
    defaultAssets: ["x_post", "visual"],
    pipeline: steps("Strategist", "Compiler", "Editor", "Creative", "Distributor"),
    createdBy: "system",
    createdAt: daysAgo(28),
    updatedAt: daysAgo(3),
  },
  {
    id: "wf_blog_social_llif",
    name: "Blog + Social (LLIF)",
    description: "Long-form blog article plus a LinkedIn post and community cross-post. Includes optimization pass.",
    brand: "LLIF",
    category: "blog",
    defaultPublishMode: "schedule",
    defaultChannels: ["linkedin", "community"],
    defaultAssets: ["blog", "linkedin_post", "visual"],
    pipeline: steps("Strategist", "Compiler", "Editor", "Creative", "Optimizer", "Distributor"),
    createdBy: "system",
    createdAt: daysAgo(25),
    updatedAt: daysAgo(2),
  },
  {
    id: "wf_campaign_bestlife",
    name: "Full Campaign (BestLife)",
    description: "Multi-channel campaign: LinkedIn, X, and Newsletter email. Full pipeline with optimization.",
    brand: "BestLife",
    category: "campaign",
    defaultPublishMode: "schedule",
    defaultChannels: ["linkedin", "x", "newsletter"],
    defaultAssets: ["linkedin_post", "x_post", "email", "visual"],
    pipeline: steps("Strategist", "Compiler", "Editor", "Creative", "Optimizer", "Distributor"),
    createdBy: "system",
    createdAt: daysAgo(20),
    updatedAt: daysAgo(1),
  },
  {
    id: "wf_website_llif",
    name: "Website Update (LLIF Git)",
    description: "Generates a website page update and opens a GitHub PR. No social assets.",
    brand: "LLIF",
    category: "website",
    defaultPublishMode: "draft",
    defaultChannels: ["website_git"],
    defaultAssets: ["website_page"],
    pipeline: steps("Strategist", "Compiler", "Editor", "Distributor"),
    createdBy: "system",
    createdAt: daysAgo(15),
    updatedAt: daysAgo(1),
  },
  {
    id: "wf_custom_any",
    name: "Custom Minimal (Any)",
    description: "Lightweight pipeline with just Compiler and Editor. Works for any brand. No defaults — configure as needed.",
    brand: "Any",
    category: "custom",
    defaultPublishMode: "draft",
    defaultChannels: [],
    defaultAssets: [],
    pipeline: steps("Compiler", "Editor"),
    createdBy: "system",
    createdAt: daysAgo(10),
    updatedAt: daysAgo(0),
  },
];

const workflowStore = new Map<string, WorkflowTemplate>(
  SEED_WORKFLOWS.map((t) => [t.id, t])
);

// ── Workflow public API ───────────────────────────────────────────────────────

export function listWorkflowTemplates(): WorkflowTemplate[] {
  return [...workflowStore.values()].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export function getWorkflowTemplate(id: string): WorkflowTemplate | undefined {
  return workflowStore.get(id);
}

export function createWorkflowTemplate(
  payload: CreateWorkflowPayload,
  createdBy = "You"
): WorkflowTemplate {
  const t: WorkflowTemplate = {
    id: `wf_${uid()}`,
    name: payload.name,
    description: payload.description,
    brand: payload.brand,
    category: payload.category,
    defaultPublishMode: payload.defaultPublishMode,
    defaultChannels: payload.defaultChannels ?? [],
    defaultAssets: payload.defaultAssets ?? [],
    pipeline: payload.pipeline.map(makeStep),
    createdBy,
    createdAt: now(),
    updatedAt: now(),
  };
  workflowStore.set(t.id, t);
  return t;
}

export function updateWorkflowTemplate(
  id: string,
  payload: Partial<CreateWorkflowPayload>
): WorkflowTemplate | undefined {
  const existing = workflowStore.get(id);
  if (!existing) return undefined;
  const updated: WorkflowTemplate = {
    ...existing,
    ...payload,
    pipeline: payload.pipeline ? payload.pipeline.map(makeStep) : existing.pipeline,
    updatedAt: now(),
  };
  workflowStore.set(id, updated);
  return updated;
}

/**
 * Applies a workflow template to produce a CreateMessagePayload.
 * User-supplied values override template defaults.
 */
export function applyWorkflowTemplateToMessage(
  templateId: string,
  overrides: Partial<CreateMessagePayload> & Pick<CreateMessagePayload, "idea" | "brand">
): CreateMessagePayload {
  const tmpl = workflowStore.get(templateId);
  if (!tmpl) throw new Error(`Workflow template not found: ${templateId}`);

  return {
    idea: overrides.idea,
    brand: overrides.brand,
    channels: overrides.channels ?? tmpl.defaultChannels ?? [],
    publishMode: overrides.publishMode ?? tmpl.defaultPublishMode ?? "draft",
    scheduledFor: overrides.scheduledFor,
    assetTypes: overrides.assetTypes ?? tmpl.defaultAssets ?? undefined,
    templateId,
  };
}
