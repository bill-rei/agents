/**
 * lib/xai-video.js — xAI Grok/Imagine Video API client
 *
 * Wraps the xAI video generation REST API:
 *   POST /v1/video/generations          — start generation job
 *   GET  /v1/video/generations/{jobId}  — poll status
 *
 * Environment variables:
 *   XAI_API_KEY      — required
 *   XAI_API_BASE_URL — optional (default: https://api.x.ai)
 */

const XAI_API_BASE = process.env.XAI_API_BASE_URL || 'https://api.x.ai';

/** @returns {string} */
function getApiKey() {
  const key = process.env.XAI_API_KEY;
  if (!key) throw new Error('XAI_API_KEY is not set');
  return key;
}

/**
 * @typedef {'9:16'|'16:9'|'1:1'} AspectRatio
 * @typedef {'pending'|'processing'|'completed'|'failed'} VideoJobStatus
 */

/**
 * Start a video generation job.
 *
 * @param {object} options
 * @param {string}      options.prompt          — Descriptive video prompt
 * @param {AspectRatio} options.aspectRatio      — Target aspect ratio
 * @param {number}      [options.durationSeconds] — Duration in seconds (5 | 10 | 15)
 * @param {string}      [options.referenceImageUrl] — Optional seed image URL
 * @param {string}      [options.model]           — Model ID (default: 'imagine-video-v1')
 * @returns {Promise<string>} jobId
 */
async function createVideoJob({ prompt, aspectRatio, durationSeconds = 10, referenceImageUrl, model }) {
  const key = getApiKey();
  const body = {
    model: model || process.env.XAI_VIDEO_MODEL || 'imagine-video-v1',
    prompt,
    aspect_ratio: aspectRatio,
    duration_seconds: durationSeconds,
  };
  if (referenceImageUrl) body.reference_image_url = referenceImageUrl;

  const res = await fetch(`${XAI_API_BASE}/v1/video/generations`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`xAI video createJob failed (${res.status}): ${err.error?.message ?? JSON.stringify(err)}`);
  }

  const data = await res.json();
  if (!data.id) throw new Error('xAI API did not return a job id');
  return data.id;
}

/**
 * Poll the status of a video generation job.
 *
 * @param {string} jobId
 * @returns {Promise<{ status: VideoJobStatus, videoUrl?: string, failureReason?: string }>}
 */
async function getVideoJobStatus(jobId) {
  const key = getApiKey();

  const res = await fetch(`${XAI_API_BASE}/v1/video/generations/${encodeURIComponent(jobId)}`, {
    headers: { Authorization: `Bearer ${key}` },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`xAI video getStatus failed (${res.status}): ${err.error?.message ?? JSON.stringify(err)}`);
  }

  const data = await res.json();
  return {
    status: data.status,
    videoUrl: data.video_url ?? data.output?.video_url ?? null,
    failureReason: data.failure_reason ?? null,
  };
}

/**
 * Poll until the job reaches a terminal state or timeout is exceeded.
 *
 * @param {string} jobId
 * @param {object} [opts]
 * @param {number} [opts.maxAttempts=60]    — Max poll cycles (default: 60 × 5 s = 5 min)
 * @param {number} [opts.intervalMs=5000]   — Poll interval in ms
 * @returns {Promise<string>} videoUrl
 */
async function pollVideoReady(jobId, { maxAttempts = 60, intervalMs = 5000 } = {}) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { status, videoUrl, failureReason } = await getVideoJobStatus(jobId);

    if (status === 'completed') {
      if (!videoUrl) throw new Error(`xAI job ${jobId} completed but no videoUrl returned`);
      return videoUrl;
    }

    if (status === 'failed') {
      throw new Error(`xAI video generation failed: ${failureReason ?? 'unknown reason'}`);
    }

    // 'pending' or 'processing' — keep waiting
    await sleep(intervalMs);
  }

  throw new Error(`xAI video generation timed out after ${maxAttempts} attempts (jobId: ${jobId})`);
}

/**
 * Download video bytes from a signed URL returned by xAI.
 *
 * @param {string} videoUrl
 * @returns {Promise<Buffer>}
 */
async function downloadVideo(videoUrl) {
  const res = await fetch(videoUrl);
  if (!res.ok) throw new Error(`Failed to download xAI video (${res.status}): ${videoUrl}`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Full pipeline: create job → poll → download.
 *
 * @param {object} options  — Same as createVideoJob options
 * @param {object} [pollOpts] — Forwarded to pollVideoReady
 * @returns {Promise<{ jobId: string, bytes: Buffer }>}
 */
async function generateVideo(options, pollOpts) {
  const jobId = await createVideoJob(options);
  const videoUrl = await pollVideoReady(jobId, pollOpts);
  const bytes = await downloadVideo(videoUrl);
  return { jobId, bytes };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { createVideoJob, getVideoJobStatus, pollVideoReady, downloadVideo, generateVideo };
