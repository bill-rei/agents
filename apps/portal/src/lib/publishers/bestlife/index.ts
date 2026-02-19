/**
 * Best Life Social Publisher — Orchestrator
 *
 * Routes selected channels to either direct API publish or the Publish Assist Pack.
 * Brand boundary is enforced here: only "bestlife" artifacts are accepted.
 */

import { db } from "@/lib/db";
import {
  getDirectChannelKeys,
  getAssistChannelKeys,
  getAllChannelKeys,
  isValidChannelKey,
} from "./channelRegistry";
import { publishToX, publishToLinkedIn, publishToFacebook } from "./directPublisher";
import type { SocialArtifact, ChannelResult } from "./directPublisher";
import { buildAssistPack, writeAssistPack } from "./assistPackGenerator";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";

// ── Validation ────────────────────────────────────────────────────────────────

export interface ValidationError {
  code: "BRAND_MISMATCH" | "EMPTY_CHANNELS" | "UNKNOWN_CHANNELS";
  message: string;
  unknownKeys?: string[];
}

export function validateBestLifePublish(
  brand: string,
  selectedChannelKeys: string[]
): ValidationError | null {
  if (brand.toLowerCase() !== "bestlife") {
    return {
      code: "BRAND_MISMATCH",
      message: `Brand boundary violation: this publisher only accepts "bestlife" artifacts. Got: "${brand}"`,
    };
  }

  if (selectedChannelKeys.length === 0) {
    return {
      code: "EMPTY_CHANNELS",
      message: "At least one channel must be selected.",
    };
  }

  const unknown = selectedChannelKeys.filter((k) => !isValidChannelKey(k));
  if (unknown.length > 0) {
    return {
      code: "UNKNOWN_CHANNELS",
      message: `Unknown Best Life channel key(s): ${unknown.join(", ")}`,
      unknownKeys: unknown,
    };
  }

  return null;
}

// ── Direct channel dispatch ───────────────────────────────────────────────────

const DIRECT_DISPATCH: Record<
  string,
  (artifact: SocialArtifact) => Promise<ChannelResult>
> = {
  x_profile: publishToX,
  linkedin_company_page: publishToLinkedIn,
  facebook_page: publishToFacebook,
};

async function runDirectChannel(
  channelKey: string,
  artifact: SocialArtifact,
  dryRun: boolean
): Promise<ChannelResult> {
  if (dryRun) {
    return {
      mode: "direct",
      status: "skipped",
      durationMs: 0,
      postId: undefined,
      postUrl: undefined,
    };
  }

  const dispatch = DIRECT_DISPATCH[channelKey];
  if (!dispatch) {
    return {
      mode: "direct",
      status: "failed",
      error: `No direct publisher registered for channel: ${channelKey}`,
      durationMs: 0,
    };
  }

  return dispatch(artifact);
}

// ── Orchestrator ──────────────────────────────────────────────────────────────

export interface BestLifePublishInput {
  artifactId: string;
  brand: string;
  artifact: SocialArtifact;
  selectedChannelKeys: string[];
  projectSlug: string;
  scheduledAt?: string;
  userId: string;
  dryRun?: boolean;
}

export async function runBestLifeSocialJob(input: BestLifePublishInput) {
  const {
    artifactId,
    brand,
    artifact,
    selectedChannelKeys,
    projectSlug,
    scheduledAt,
    userId,
    dryRun = false,
  } = input;

  // 1. Validate brand + channel selection
  const validationError = validateBestLifePublish(brand, selectedChannelKeys);
  if (validationError) throw validationError;

  // 2. Partition channels
  const allDirectKeys = getDirectChannelKeys();
  const allAssistKeys = getAssistChannelKeys();

  const directChannels = selectedChannelKeys.filter((k) => allDirectKeys.includes(k));
  const assistChannels = selectedChannelKeys.filter((k) => allAssistKeys.includes(k));

  // 3. Create DB record
  const job = await db.publishJob.create({
    data: {
      artifactId,
      brand,
      selectedChannels: selectedChannelKeys,
      directChannels,
      assistChannels,
      status: "running",
      dryRun,
      channelResults: {},
      createdByUserId: userId,
    },
  });

  const channelResults: Record<string, ChannelResult> = {};
  let anyDirectFailed = false;

  // 4. Run direct channels in parallel
  const directResults = await Promise.allSettled(
    directChannels.map(async (key) => {
      const result = await runDirectChannel(key, artifact, dryRun);
      return { key, result };
    })
  );

  for (const settled of directResults) {
    if (settled.status === "fulfilled") {
      const { key, result } = settled.value;
      channelResults[key] = result;
      if (result.status === "failed") anyDirectFailed = true;
    } else {
      // Unexpected throw
      const key = directChannels[directResults.indexOf(settled)];
      channelResults[key] = {
        mode: "direct",
        status: "failed",
        error: settled.reason?.message || "Unexpected error",
        durationMs: 0,
      };
      anyDirectFailed = true;
    }
  }

  // 5. Build assist pack for assist channels
  let assistPackPath: string | null = null;

  if (assistChannels.length > 0) {
    try {
      const pack = buildAssistPack(artifact, assistChannels, scheduledAt);
      const { storagePath } = writeAssistPack(pack, projectSlug, job.id, UPLOAD_DIR);
      assistPackPath = storagePath;

      for (const key of assistChannels) {
        channelResults[key] = { mode: "assist", status: "success", durationMs: 0 };
      }
    } catch (err) {
      for (const key of assistChannels) {
        channelResults[key] = {
          mode: "assist",
          status: "failed",
          error: (err as Error).message,
          durationMs: 0,
        };
      }
    }
  }

  // 6. Determine final status
  const allKeys = [...directChannels, ...assistChannels];
  const allSuccess = allKeys.every((k) => channelResults[k]?.status === "success" || channelResults[k]?.status === "skipped");
  const anySuccess = allKeys.some((k) => channelResults[k]?.status === "success" || channelResults[k]?.status === "skipped");

  const finalStatus = allSuccess
    ? "completed"
    : anySuccess
    ? "partial"
    : "failed";

  // 7. Update DB record
  const updated = await db.publishJob.update({
    where: { id: job.id },
    data: {
      status: finalStatus,
      channelResults: channelResults as object,
      assistPackPath,
    },
  });

  // 8. Create PublishLog entries per channel
  if (!dryRun) {
    await Promise.all(
      Object.entries(channelResults).map(([channelKey, result]) =>
        db.publishLog.create({
          data: {
            artifactId,
            userId,
            destination: `bestlife-${result.mode}:${channelKey}`,
            result: result as object,
          },
        })
      )
    );
  }

  return updated;
}

// ── Dry-run preview helper (no DB writes) ─────────────────────────────────────

export interface DryRunPreview {
  directChannels: string[];
  assistChannels: string[];
  channelPreviews: Array<{
    key: string;
    label: string;
    mode: "direct" | "assist";
    postText: string;
    characterCount: number;
    charLimit: number;
    withinLimit: boolean;
  }>;
}

export function buildDryRunPreview(
  artifact: SocialArtifact,
  selectedChannelKeys: string[]
): DryRunPreview {
  const { getAllChannels, truncateForChannel } = require("./channelRegistry") as typeof import("./channelRegistry");
  const allChannels = getAllChannels();
  const allDirectKeys = getDirectChannelKeys();
  const allAssistKeys = getAssistChannelKeys();

  return {
    directChannels: selectedChannelKeys.filter((k) => allDirectKeys.includes(k)),
    assistChannels: selectedChannelKeys.filter((k) => allAssistKeys.includes(k)),
    channelPreviews: selectedChannelKeys.map((key) => {
      const config = allChannels.find((c) => c.key === key)!;
      const postText = truncateForChannel(artifact.body, key);
      return {
        key,
        label: config.label,
        mode: config.publishMode,
        postText,
        characterCount: postText.length,
        charLimit: config.charLimit,
        withinLimit: postText.length <= config.charLimit,
      };
    }),
  };
}
