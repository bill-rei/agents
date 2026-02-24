/**
 * Shared approval state machine for social preview approvals.
 * Used by the three approval API routes (approve-all, approve-channel, request-changes).
 */

import { createHash } from "crypto";
import { db } from "@/lib/db";
import { buildAgentOutputMarkdown } from "@/lib/agentOutput/contract";
import { PLATFORMS, type SocialPlatform } from "./platformRules";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ChannelStatus = "pending" | "approved" | "changes_requested";
export type OverallStatus = "pending" | "partial" | "approved_all" | "needs_changes";

export interface ChannelApprovalState {
  status: ChannelStatus;
  comment: string | null;
  by: string | null;
  at: string | null;
}

export interface ApprovalEvent {
  type: "approve_channel" | "approve_all" | "request_changes";
  platform?: SocialPlatform | "all";
  comment: string;
  by: string;
  at: string;
}

export interface ChannelsMap {
  x: ChannelApprovalState;
  linkedin: ChannelApprovalState;
  instagram: ChannelApprovalState;
}

export interface SocialApprovalState {
  id: string;
  runId: string;
  brand: string;
  overall: OverallStatus;
  channels: ChannelsMap;
  history: ApprovalEvent[];
  updatedAt: Date;
}

// ── Default state ─────────────────────────────────────────────────────────────

function emptyChannel(): ChannelApprovalState {
  return { status: "pending", comment: null, by: null, at: null };
}

export function defaultChannels(): ChannelsMap {
  return { x: emptyChannel(), linkedin: emptyChannel(), instagram: emptyChannel() };
}

// ── Overall status computation ────────────────────────────────────────────────

export function computeOverall(channels: ChannelsMap): OverallStatus {
  const statuses = PLATFORMS.map((p) => channels[p].status);
  if (statuses.some((s) => s === "changes_requested")) return "needs_changes";
  if (statuses.every((s) => s === "approved")) return "approved_all";
  if (statuses.some((s) => s === "approved")) return "partial";
  return "pending";
}

// ── Load or create SocialApproval ─────────────────────────────────────────────

export async function loadOrCreateApproval(runId: string, brand = ""): Promise<SocialApprovalState> {
  let record = await db.socialApproval.findUnique({ where: { runId } });

  if (!record) {
    record = await db.socialApproval.create({
      data: {
        runId,
        brand,
        overall: "pending",
        channels: defaultChannels() as object,
        history: [] as object[],
      },
    });
  }

  return parseRecord(record);
}

// ── Persist updated state ─────────────────────────────────────────────────────

export async function saveApproval(
  state: SocialApprovalState,
  event: ApprovalEvent
): Promise<SocialApprovalState> {
  const newHistory = [...state.history, event];
  const updated = await db.socialApproval.update({
    where: { runId: state.runId },
    data: {
      overall: state.overall,
      channels: state.channels as object,
      history: newHistory as object[],
    },
  });
  return parseRecord(updated);
}

// ── Create RunStep audit records ──────────────────────────────────────────────

export async function createApprovalStep(params: {
  runId: string;
  brand: string;
  event: ApprovalEvent;
  state: SocialApprovalState;
  distributorHash?: string | null;
}): Promise<void> {
  const { runId, brand, event, state, distributorHash } = params;
  const now = new Date().toISOString();

  // Build a human-readable description of channel states
  const channelLines = PLATFORMS.map((p) => {
    const ch = state.channels[p];
    return `- ${p}: ${ch.status}`;
  }).join("\n");

  const eventDesc =
    event.type === "approve_all"
      ? "Reviewer approved all channels."
      : event.type === "approve_channel"
      ? `Reviewer approved ${event.platform}.`
      : `Reviewer requested changes for ${event.platform ?? "all channels"}: "${event.comment}"`;

  const markdown = buildAgentOutputMarkdown({
    runId,
    agentName: "approval",
    toneMode: "work",
    brand,
    title: `Approval Decision: Social Preview`,
    summary: eventDesc,
    inputs: `- Run: ${runId}\n- Distributor output hash: ${distributorHash ?? "unknown"}\n- Reviewer: ${event.by}`,
    outputs: channelLines,
    notes: event.comment
      ? `Reviewer comment: "${event.comment}"`
      : "No additional notes.",
    nextActions:
      event.type === "request_changes"
        ? `- Editor: revise content for ${event.platform ?? "all"} based on reviewer feedback.\n- Re-run Distributor before re-approving.`
        : `- Publishing may proceed (subject to overall approval state: ${state.overall}).`,
    createdAt: now,
    step: "approval",
  });

  const hash = createHash("sha256").update(markdown).digest("hex").slice(0, 16);

  await db.runStep.create({
    data: {
      runId,
      step: "approval",
      status: "ok",
      markdownOutput: markdown,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jsonPayload: { event, state: { overall: state.overall, channels: state.channels } } as any,
      validationErrors: [],
      validationWarnings: [],
      hash,
    },
  });
}

export async function createRevisionRequestStep(params: {
  runId: string;
  brand: string;
  platform: SocialPlatform | "all" | undefined;
  comment: string;
  by: string;
  distributorHash?: string | null;
}): Promise<void> {
  const { runId, brand, platform, comment, by, distributorHash } = params;
  const now = new Date().toISOString();

  const scope = platform === "all" || !platform ? "all channels" : platform;

  const markdown = buildAgentOutputMarkdown({
    runId,
    agentName: "editor",
    toneMode: "work",
    brand,
    title: `Editor Revision Requested: ${scope}`,
    summary: `Reviewer ${by} requested changes to ${scope}. The run is blocked from publishing until revisions are approved.`,
    inputs: `- Run: ${runId}\n- Distributor output hash: ${distributorHash ?? "unknown"}\n- Platform(s): ${scope}\n- Requested by: ${by}`,
    outputs: `- New step status: editor_revision_requested\n- Affected platform(s): ${scope}`,
    notes: `Reviewer comment: "${comment}"`,
    nextActions: `- Editor agent: revise content for ${scope}.\n- Re-run Distributor.\n- Return to Preview & Approve screen for re-approval.`,
    createdAt: now,
    step: "editor_revision_requested",
  });

  const hash = createHash("sha256").update(markdown).digest("hex").slice(0, 16);

  await db.runStep.create({
    data: {
      runId,
      step: "editor_revision_requested",
      status: "ok",
      markdownOutput: markdown,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jsonPayload: { platform, comment, by, distributorHash } as any,
      validationErrors: [],
      validationWarnings: [],
      hash,
    },
  });
}

// ── Internal ──────────────────────────────────────────────────────────────────

function parseRecord(record: {
  id: string;
  runId: string;
  brand: string;
  overall: string;
  channels: unknown;
  history: unknown;
  updatedAt: Date;
}): SocialApprovalState {
  const channels = (record.channels as ChannelsMap) ?? defaultChannels();
  const history = (record.history as ApprovalEvent[]) ?? [];

  // Ensure all platforms are present (guard against old/partial records)
  for (const p of PLATFORMS) {
    if (!channels[p]) channels[p] = emptyChannel();
  }

  return {
    id: record.id,
    runId: record.runId,
    brand: record.brand,
    overall: record.overall as OverallStatus,
    channels,
    history,
    updatedAt: record.updatedAt,
  };
}
