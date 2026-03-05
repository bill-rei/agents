/**
 * /api/publish/run — Job runner
 *
 * POST body (optional): { jobId?: string }
 *   - With jobId: run only that specific job.
 *   - Without: run all queued + failed-but-retryable jobs + scheduled jobs due now.
 *
 * Retry policy:
 *   - Max 3 attempts per job.
 *   - Exponential backoff: 1 min, 2 min, 4 min between attempts.
 *   - After 3 failures → status = "dead_letter" (no further retries).
 *
 * Authentication:
 *   - Cron invocations: Authorization: Bearer {CRON_SECRET} (Vercel cron format).
 *   - Manual: requires user session cookie.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getConnector } from "@/connectors/registry";
import { buildMediaAsset } from "@/lib/mediaStore";
import type { UcsPublishJob } from "@prisma/client";
import type { UCSCanonical } from "@/lib/ucs/schema";

const MAX_ATTEMPTS = 3;
// Backoff in milliseconds: attempt 1 → 1 min, 2 → 2 min, 3 → 4 min
const BACKOFF_MS = [60_000, 120_000, 240_000];

interface RunResult {
  jobId: string;
  platform: string;
  status: "published" | "failed" | "dead_letter" | "not_supported";
  error?: string;
}

async function addEvent(
  publishJobId: string,
  level: "info" | "warn" | "error",
  message: string,
  meta: object = {}
) {
  await db.ucsJobEvent.create({
    data: { publishJobId, level, message, metaJson: meta },
  });
}

async function runJob(job: UcsPublishJob): Promise<RunResult> {
  const attemptNumber = job.attemptCount + 1;

  // Mark running
  await db.ucsPublishJob.update({
    where: { id: job.id },
    data: { status: "running", attemptCount: { increment: 1 }, nextRetryAt: null },
  });

  await addEvent(job.id, "info", `Attempt ${attemptNumber}/${MAX_ATTEMPTS}: publishing to ${job.platform}…`);

  try {
    const connection = await db.channelConnection.findUnique({
      where: { id: job.connectionId },
    });
    if (!connection) throw new Error("Channel connection not found");

    if (connection.brandMode !== job.brandMode) {
      throw new Error(`Brand mismatch: job is ${job.brandMode}, connection is ${connection.brandMode}`);
    }

    await addEvent(job.id, "info", `Using connection: ${connection.displayName}`);

    const connector = getConnector(job.platform);

    // Refresh token if needed
    const freshConn = await connector.refreshTokenIfNeeded(connection);
    if (freshConn.updatedAt > connection.updatedAt) {
      await addEvent(job.id, "info", "Access token refreshed.");
    }

    // Get UCS message + renders
    const ucs = await db.ucsMessage.findUnique({ where: { id: job.ucsMessageId } });
    if (!ucs) throw new Error("UCS message not found");

    const renders = ucs.rendersJson as Record<string, string>;
    const text = renders[job.platform];
    if (!text) {
      throw new Error(`No render found for platform "${job.platform}". Generate renders first.`);
    }

    // Resolve media from UCS canonical (use first mediaRef if present)
    const canonical = ucs.canonicalJson as UCSCanonical;
    const firstMediaRef = canonical.mediaRefs?.[0]?.ref;

    let result;

    if (firstMediaRef && connector.publishMedia) {
      const media = buildMediaAsset(firstMediaRef);
      await addEvent(job.id, "info", `Media ref resolved: type=${media.type}, url=${media.url ?? "file (no public URL)"}`);

      if (media.url) {
        await addEvent(job.id, "info", `Publishing media post (${media.type}) to ${job.platform}…`);
        result = await connector.publishMedia(freshConn, text, media);
        // If publishMedia returns { supported: false }, fall back to text
        if ("supported" in result && result.supported === false) {
          await addEvent(job.id, "warn", "publishMedia not supported — falling back to text-only.");
          result = await connector.publishText(freshConn, text);
        }
      } else {
        await addEvent(job.id, "warn", `Media ref "${firstMediaRef}" is a file path with no public URL — publishing text only.`);
        result = await connector.publishText(freshConn, text);
      }
    } else {
      await addEvent(job.id, "info", `Publishing ${text.length}-char post to ${job.platform}…`);
      result = await connector.publishText(freshConn, text);
    }

    // Handle NOT_SUPPORTED_YET — never retry
    if ("code" in result && result.code === "NOT_SUPPORTED_YET") {
      await addEvent(job.id, "warn", `Platform capability not yet available: ${result.reason}`, {
        next_steps: result.next_steps,
      });
      await db.ucsPublishJob.update({
        where: { id: job.id },
        data: {
          status: "not_supported",
          lastError: `NOT_SUPPORTED_YET: ${result.reason}`,
        },
      });
      return { jobId: job.id, platform: job.platform, status: "not_supported", error: result.reason };
    }

    // At this point result is PublishTextResult | PublishFailResult (supported: false already fell back to publishText)
    const textResult = result as { success: boolean; postId?: string; postUrl?: string; error?: string };
    if (!textResult.success) {
      throw new Error(textResult.error);
    }

    await addEvent(job.id, "info", `✓ Published: ${textResult.postUrl ?? textResult.postId}`, {
      postId: textResult.postId,
      postUrl: textResult.postUrl,
    });

    await db.ucsPublishJob.update({
      where: { id: job.id },
      data: { status: "published", lastError: null, nextRetryAt: null },
    });

    return { jobId: job.id, platform: job.platform, status: "published" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const isDeadLetter = attemptNumber >= MAX_ATTEMPTS;
    const nextRetryAt = isDeadLetter
      ? null
      : new Date(Date.now() + (BACKOFF_MS[attemptNumber - 1] ?? BACKOFF_MS[BACKOFF_MS.length - 1]));

    await addEvent(job.id, "error", `✗ Failed (attempt ${attemptNumber}): ${msg}`, {
      isDeadLetter,
      nextRetryAt: nextRetryAt?.toISOString(),
    });

    await db.ucsPublishJob.update({
      where: { id: job.id },
      data: {
        status: isDeadLetter ? "dead_letter" : "failed",
        lastError: msg,
        nextRetryAt,
      },
    });

    return {
      jobId: job.id,
      platform: job.platform,
      status: isDeadLetter ? "dead_letter" : "failed",
      error: msg,
    };
  }
}

/** GET — dev/browser convenience. */
export async function GET(req: NextRequest) {
  return POST(req);
}

export async function POST(req: NextRequest) {
  // Vercel cron sends: Authorization: Bearer {CRON_SECRET}
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  const isCron =
    cronSecret &&
    (authHeader === `Bearer ${cronSecret}` ||
      req.headers.get("x-cron-secret") === cronSecret);

  if (!isCron) {
    try {
      await requireAuth();
    } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const body = await req.json().catch(() => ({})) as { jobId?: string };

  let jobs: UcsPublishJob[];

  if (body.jobId) {
    const job = await db.ucsPublishJob.findUnique({ where: { id: body.jobId } });
    jobs = job ? [job] : [];
  } else {
    const now = new Date();
    jobs = await db.ucsPublishJob.findMany({
      where: {
        OR: [
          { status: "queued" },
          { status: "scheduled", scheduledFor: { lte: now } },
          // Retry failed jobs whose backoff window has elapsed
          {
            status: "failed",
            attemptCount: { lt: MAX_ATTEMPTS },
            OR: [
              { nextRetryAt: null },
              { nextRetryAt: { lte: now } },
            ],
          },
        ],
      },
      orderBy: { createdAt: "asc" },
      take: 50,
    });
  }

  if (!jobs.length) {
    return NextResponse.json({ message: "No jobs to run", results: [] });
  }

  const results: RunResult[] = [];
  for (const job of jobs) {
    const result = await runJob(job);
    results.push(result);
  }

  return NextResponse.json({ results });
}
