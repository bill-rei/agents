// ── Brands ────────────────────────────────────────────────────────────────────
export type Brand = "LLIF" | "BestLife";

// ── Publish ───────────────────────────────────────────────────────────────────
export type PublishMode = "draft" | "now" | "schedule";

// ── Message status ────────────────────────────────────────────────────────────
export type MessageStatus =
  | "draft"
  | "generating"
  | "in_review"
  | "scheduled"
  | "published"
  | "needs_edits";

// ── Roles (Sprint 1 mock — separate from DB Role enum) ───────────────────────
export type MockRole = "admin" | "reviewer" | "editor" | "contributor";

// ── Channels ──────────────────────────────────────────────────────────────────
export type Channel =
  | "linkedin"
  | "x"
  | "newsletter"
  | "community"
  | "website_git";

export const CHANNEL_LABELS: Record<Channel, string> = {
  linkedin: "LinkedIn",
  x: "X (Twitter)",
  newsletter: "Newsletter",
  community: "Community",
  website_git: "Website (Git)",
};

export const ALL_CHANNELS: Channel[] = [
  "linkedin",
  "x",
  "newsletter",
  "community",
  "website_git",
];

// ── Agent pipeline ────────────────────────────────────────────────────────────
export type AgentStepName =
  | "Strategist"
  | "Compiler"
  | "Editor"
  | "Creative"
  | "Distributor"
  | "Optimizer";

export const ALL_AGENT_STEP_NAMES: AgentStepName[] = [
  "Strategist",
  "Compiler",
  "Editor",
  "Creative",
  "Optimizer",
  "Distributor",
];

export type AgentStepState = "idle" | "running" | "done" | "error";

export interface AgentStep {
  id: string;
  name: AgentStepName;
  state: AgentStepState;
}

// ── Activity events ───────────────────────────────────────────────────────────
export type ActivityLevel = "info" | "warn" | "error";

export interface AgentActivityEvent {
  id: string;
  ts: string; // ISO string
  agentName: AgentStepName;
  level: ActivityLevel;
  message: string;
}

// ── Assets ────────────────────────────────────────────────────────────────────
export type AssetType =
  | "linkedin_post"
  | "x_post"
  | "blog"
  | "website_page"
  | "email"
  | "visual";

export type AssetStatus = "generated" | "edited" | "regenerating";

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  linkedin_post: "LinkedIn Post",
  x_post: "X Post",
  blog: "Blog Article",
  website_page: "Website Page",
  email: "Email",
  visual: "Visual",
};

export const ALL_ASSET_TYPES: AssetType[] = [
  "linkedin_post",
  "x_post",
  "blog",
  "website_page",
  "email",
  "visual",
];

export interface Asset {
  id: string;
  type: AssetType;
  status: AssetStatus;
  contentText?: string;
  contentUrl?: string; // for visuals
  lastUpdatedAt: string; // ISO string
}

// ── Message ───────────────────────────────────────────────────────────────────
export interface Message {
  id: string;
  title: string;
  idea: string;
  brand: Brand;
  publishMode: PublishMode;
  scheduledFor?: string; // ISO string
  channels: Channel[];
  status: MessageStatus;
  createdBy: string; // userId or name
  createdAt: string; // ISO string
  pipeline: AgentStep[];
  assets: Asset[];
  activity: AgentActivityEvent[];
  templateId?: string; // if created from a workflow template
}

// ── Create message payload ────────────────────────────────────────────────────
export interface CreateMessagePayload {
  idea: string;
  brand: Brand;
  channels: Channel[];
  publishMode: PublishMode;
  scheduledFor?: string;
  assetTypes?: AssetType[]; // if omitted, generate all for channels
  templateId?: string;      // optional: apply a workflow template pipeline
}

// ── Workflow Templates ────────────────────────────────────────────────────────
export type WorkflowCategory = "social" | "blog" | "campaign" | "website" | "custom";
export type WorkflowBrandScope = Brand | "Any";

export const WORKFLOW_CATEGORY_LABELS: Record<WorkflowCategory, string> = {
  social: "Social",
  blog: "Blog",
  campaign: "Campaign",
  website: "Website",
  custom: "Custom",
};

export const WORKFLOW_CATEGORY_COLORS: Record<WorkflowCategory, string> = {
  social: "bg-blue-100 text-blue-700",
  blog: "bg-amber-100 text-amber-700",
  campaign: "bg-violet-100 text-violet-700",
  website: "bg-teal-100 text-teal-700",
  custom: "bg-gray-100 text-gray-600",
};

export interface WorkflowTemplate {
  id: string;
  name: string;
  description?: string;
  /** "Any" = can be applied to either brand; user still picks one brand per message. */
  brand: WorkflowBrandScope;
  category: WorkflowCategory;
  defaultPublishMode?: PublishMode;
  defaultChannels?: Channel[];
  defaultAssets?: AssetType[];
  /** Ordered pipeline steps (state is always "idle" in templates). */
  pipeline: AgentStep[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWorkflowPayload {
  name: string;
  description?: string;
  brand: WorkflowBrandScope;
  category: WorkflowCategory;
  defaultPublishMode?: PublishMode;
  defaultChannels?: Channel[];
  defaultAssets?: AssetType[];
  pipeline: AgentStepName[]; // step names only; store creates AgentStep objects
}
