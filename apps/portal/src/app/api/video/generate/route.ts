/**
 * POST /api/video/generate
 *
 * Pipeline:
 *   1. Auth + input validation
 *   2. Verify artifact exists + detect brand
 *   3. Call marketing-video-producer agent (port 3008) for safety check + prompts
 *   4. Create AgentJob record, return { jobId } immediately
 *   5. Background: for each variant, call xAI → poll → download → save → WP upload → VideoAsset row
 *
 * The caller polls GET /api/video/[jobId] to track progress.
 *
 * Allowed roles: admin, approver, publisher
 */

import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { createVideoJob, pollVideoReady, downloadVideo } from "@/lib/video/xaiVideoClient";
import { uploadWpMedia } from "@/lib/wp/wpMediaUpload";
import type { Brand } from "@/lib/designContract/schema";

export const runtime = "nodejs";

const VIDEO_PRODUCER_PORT = process.env.VIDEO_PRODUCER_PORT || "3008";
const VIDEO_PRODUCER_URL = `http://localhost:${VIDEO_PRODUCER_PORT}/api/compile`;

type AspectRatio = "9:16" | "16:9" | "1:1";

interface VariantRequest {
  variant_id: string;
  aspect_ratio: AspectRatio;
  duration_seconds: 5 | 10 | 15;
}

interface GenerateRequest {
  artifactId: string;
  brand: "llif" | "bestlife";
  brief: string;
  channels?: string[];
  sourceAssets?: Array<{ type: string; url: string; description: string }>;
  variants: VariantRequest[];
  notes?: string;
}

interface AgentPromptItem {
  variant_id: string;
  aspect_ratio: AspectRatio;
  duration_seconds: number;
  prompt: string;
  negative_prompt?: string;
}

interface AgentPlan {
  refused: false;
  brand: string;
  campaign_id: string;
  safety_check: { passed: boolean; flags: string[] };
  prompts: AgentPromptItem[];
}

export async function POST(req: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: GenerateRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { artifactId, brand, brief, channels, sourceAssets, variants, notes } = body;

  if (!artifactId || !brand || !brief || !Array.isArray(variants) || variants.length === 0) {
    return NextResponse.json(
      { error: "artifactId, brand, brief, and at least one variant are required" },
      { status: 400 }
    );
  }

  if (brand !== "llif" && brand !== "bestlife") {
    return NextResponse.json({ error: `Invalid brand "${brand}"` }, { status: 400 });
  }

  // ── Verify artifact ───────────────────────────────────────────────────────
  const artifact = await db.artifact.findUnique({
    where: { id: artifactId },
    select: { id: true, runId: true },
  });
  if (!artifact) {
    return NextResponse.json({ error: "Artifact not found" }, { status: 404 });
  }

  // ── Call video producer agent for safety check + prompts ──────────────────
  let plan: AgentPlan;
  try {
    const agentRes = await fetch(VIDEO_PRODUCER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaign_id: artifactId,
        brand,
        brief,
        channels: channels ?? [],
        source_assets: sourceAssets ?? [],
        variants,
        notes: notes ?? "",
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (agentRes.status === 422) {
      const errBody = await agentRes.json() as { error: string; gate?: string };
      return NextResponse.json(
        { error: errBody.error, gate: errBody.gate, refused: true },
        { status: 422 }
      );
    }

    if (!agentRes.ok) {
      const errBody = await agentRes.json().catch(() => ({})) as { error?: string };
      return NextResponse.json(
        { error: errBody.error ?? `Agent error ${agentRes.status}` },
        { status: 502 }
      );
    }

    const agentData = await agentRes.json() as { result: string };
    plan = JSON.parse(agentData.result) as AgentPlan;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Video producer agent unreachable: ${msg}` },
      { status: 503 }
    );
  }

  // ── Create AgentJob ───────────────────────────────────────────────────────
  const job = await db.agentJob.create({
    data: {
      type: "video_generate",
      status: "running",
      input: { artifactId, brand, variantCount: variants.length },
      createdByUserId: user.id,
    },
  });

  // ── Fire background generation (detached promise) ──────────────────────────
  runVideoGenerationBackground({
    jobId: job.id,
    artifactId,
    brand: brand as Brand,
    userId: user.id,
    runId: artifact.runId,
    prompts: plan.prompts,
  }).catch((err) => {
    console.error(`[video/generate] Background job ${job.id} crashed:`, err);
  });

  return NextResponse.json({ ok: true, jobId: job.id });
}

// ─── Background pipeline ─────────────────────────────────────────────────────

interface BackgroundParams {
  jobId: string;
  artifactId: string;
  brand: Brand;
  userId: string;
  runId: string;
  prompts: AgentPromptItem[];
}

async function runVideoGenerationBackground({
  jobId,
  artifactId,
  brand,
  userId,
  runId,
  prompts,
}: BackgroundParams): Promise<void> {
  const results: Array<{ variantId: string; ok: boolean; error?: string; videoAssetId?: string }> = [];

  for (const promptItem of prompts) {
    try {
      // 1. Call xAI
      const xaiJobId = await createVideoJob({
        prompt: promptItem.prompt,
        aspectRatio: promptItem.aspect_ratio,
        durationSeconds: promptItem.duration_seconds as 5 | 10 | 15,
      });

      // 2. Poll (up to 5 min)
      const videoUrl = await pollVideoReady(xaiJobId);

      // 3. Download bytes
      const bytes = await downloadVideo(videoUrl);

      // 4. Save to local filesystem
      const uploadDir = process.env.UPLOAD_DIR ?? "./uploads";
      const variantDir = path.join(uploadDir, artifactId, promptItem.variant_id);
      fs.mkdirSync(variantDir, { recursive: true });
      const videoFilename = "video.mp4";
      fs.writeFileSync(path.join(variantDir, videoFilename), bytes);
      const storagePath = path.join(artifactId, promptItem.variant_id, videoFilename);

      // Save meta.json alongside
      fs.writeFileSync(
        path.join(variantDir, "meta.json"),
        JSON.stringify({ variantId: promptItem.variant_id, aspect_ratio: promptItem.aspect_ratio, duration_seconds: promptItem.duration_seconds, xaiJobId, brand, createdAt: new Date().toISOString() }, null, 2)
      );

      // 5. Upload to WordPress Media Library
      let wpUrl: string | undefined;
      let wpMediaId: number | undefined;
      let wpSite: string | undefined;

      try {
        const wpMedia = await uploadWpMedia(
          brand,
          `${promptItem.variant_id}.mp4`,
          "video/mp4",
          bytes,
          `Marketing video — ${promptItem.variant_id}`
        );
        wpUrl = wpMedia.url;
        wpMediaId = wpMedia.id;
        wpSite = brand;
      } catch (wpErr) {
        // Non-fatal: file is saved locally, WP upload is best-effort
        console.warn(`[video/generate] WP upload failed for variant ${promptItem.variant_id}:`, wpErr);
      }

      // 6. Record VideoAsset
      const videoAsset = await db.videoAsset.create({
        data: {
          artifactId,
          agentJobId: jobId,
          brand,
          variantId: promptItem.variant_id,
          aspectRatio: promptItem.aspect_ratio,
          durationSeconds: promptItem.duration_seconds,
          storagePath,
          wpUrl,
          wpMediaId,
          wpSite,
          xaiJobId,
          meta: { prompt: promptItem.prompt, negativePrompt: promptItem.negative_prompt },
          createdByUserId: userId,
        },
      });

      results.push({ variantId: promptItem.variant_id, ok: true, videoAssetId: videoAsset.id });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ variantId: promptItem.variant_id, ok: false, error: msg });
    }
  }

  const allOk = results.every((r) => r.ok);

  await db.agentJob.update({
    where: { id: jobId },
    data: {
      status: allOk ? "completed" : results.some((r) => r.ok) ? "completed" : "failed",
      output: { results },
      ...(allOk ? {} : { error: results.filter((r) => !r.ok).map((r) => `${r.variantId}: ${r.error}`).join("; ").slice(0, 2000) }),
    },
  });
}
