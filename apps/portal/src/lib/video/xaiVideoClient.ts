/**
 * lib/video/xaiVideoClient.ts — xAI Grok/Imagine Video API client (TypeScript)
 *
 * Wraps the xAI video generation REST API:
 *   POST /v1/video/generations          — start generation job
 *   GET  /v1/video/generations/{jobId}  — poll status
 *
 * Environment:
 *   XAI_API_KEY      (required)
 *   XAI_API_BASE_URL (optional, default: https://api.x.ai)
 */

const XAI_API_BASE = process.env.XAI_API_BASE_URL ?? "https://api.x.ai";

export type AspectRatio = "9:16" | "16:9" | "1:1";
export type VideoJobStatus = "pending" | "processing" | "completed" | "failed";

export interface VideoJobStatusResult {
  status: VideoJobStatus;
  videoUrl?: string;
  failureReason?: string;
}

function getApiKey(): string {
  const key = process.env.XAI_API_KEY;
  if (!key) throw new Error("XAI_API_KEY is not set");
  return key;
}

export interface CreateVideoJobOptions {
  prompt: string;
  aspectRatio: AspectRatio;
  durationSeconds?: 5 | 10 | 15;
  referenceImageUrl?: string;
  model?: string;
}

/**
 * Start a video generation job.
 * @returns xAI job ID
 */
export async function createVideoJob(options: CreateVideoJobOptions): Promise<string> {
  const { prompt, aspectRatio, durationSeconds = 10, referenceImageUrl, model } = options;
  const key = getApiKey();

  const body: Record<string, unknown> = {
    model: model ?? process.env.XAI_VIDEO_MODEL ?? "imagine-video-v1",
    prompt,
    aspect_ratio: aspectRatio,
    duration_seconds: durationSeconds,
  };
  if (referenceImageUrl) body.reference_image_url = referenceImageUrl;

  const res = await fetch(`${XAI_API_BASE}/v1/video/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as Record<string, unknown>;
    const msg = (err.error as Record<string, string> | undefined)?.message ?? JSON.stringify(err);
    throw new Error(`xAI createVideoJob failed (${res.status}): ${msg}`);
  }

  const data = await res.json() as { id?: string };
  if (!data.id) throw new Error("xAI API did not return a job id");
  return data.id;
}

/** Poll the status of a video generation job. */
export async function getVideoJobStatus(jobId: string): Promise<VideoJobStatusResult> {
  const key = getApiKey();

  const res = await fetch(`${XAI_API_BASE}/v1/video/generations/${encodeURIComponent(jobId)}`, {
    headers: { Authorization: `Bearer ${key}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as Record<string, unknown>;
    const msg = (err.error as Record<string, string> | undefined)?.message ?? JSON.stringify(err);
    throw new Error(`xAI getVideoJobStatus failed (${res.status}): ${msg}`);
  }

  const data = await res.json() as {
    status: VideoJobStatus;
    video_url?: string;
    output?: { video_url?: string };
    failure_reason?: string;
  };

  return {
    status: data.status,
    videoUrl: data.video_url ?? data.output?.video_url,
    failureReason: data.failure_reason,
  };
}

/**
 * Poll until the job completes or times out.
 * @returns The video download URL
 */
export async function pollVideoReady(
  jobId: string,
  { maxAttempts = 60, intervalMs = 5000 } = {}
): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { status, videoUrl, failureReason } = await getVideoJobStatus(jobId);

    if (status === "completed") {
      if (!videoUrl) throw new Error(`xAI job ${jobId} completed but returned no videoUrl`);
      return videoUrl;
    }

    if (status === "failed") {
      throw new Error(`xAI video generation failed: ${failureReason ?? "unknown reason"}`);
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }

  throw new Error(`xAI video generation timed out (jobId: ${jobId}, attempts: ${maxAttempts})`);
}

/** Download video bytes from a signed URL. */
export async function downloadVideo(videoUrl: string): Promise<Buffer> {
  const res = await fetch(videoUrl);
  if (!res.ok) throw new Error(`Failed to download xAI video (${res.status})`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}
