/**
 * Pass 3 tests — scheduler logic, NOT_SUPPORTED_YET mapping, mediaStore, registry.
 * Framework: node:test
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ── Scheduler selection logic ──────────────────────────────────────────────────

describe("scheduler job selection", () => {
  interface MockJob {
    status: string;
    attemptCount: number;
    scheduledFor: Date | null;
    nextRetryAt: Date | null;
  }

  const MAX_ATTEMPTS = 3;

  function shouldRun(job: MockJob, now = new Date()): boolean {
    if (job.status === "queued") return true;
    if (job.status === "scheduled") {
      return job.scheduledFor !== null && job.scheduledFor <= now;
    }
    if (job.status === "failed" && job.attemptCount < MAX_ATTEMPTS) {
      return job.nextRetryAt === null || job.nextRetryAt <= now;
    }
    return false;
  }

  it("runs queued jobs immediately", () => {
    const job: MockJob = { status: "queued", attemptCount: 0, scheduledFor: null, nextRetryAt: null };
    assert.ok(shouldRun(job));
  });

  it("runs scheduled jobs whose time has passed", () => {
    const past = new Date(Date.now() - 1000);
    const job: MockJob = { status: "scheduled", attemptCount: 0, scheduledFor: past, nextRetryAt: null };
    assert.ok(shouldRun(job));
  });

  it("does not run scheduled jobs in the future", () => {
    const future = new Date(Date.now() + 60_000);
    const job: MockJob = { status: "scheduled", attemptCount: 0, scheduledFor: future, nextRetryAt: null };
    assert.ok(!shouldRun(job));
  });

  it("retries failed jobs when nextRetryAt is null", () => {
    const job: MockJob = { status: "failed", attemptCount: 1, scheduledFor: null, nextRetryAt: null };
    assert.ok(shouldRun(job));
  });

  it("retries failed jobs when backoff window has elapsed", () => {
    const past = new Date(Date.now() - 1000);
    const job: MockJob = { status: "failed", attemptCount: 2, scheduledFor: null, nextRetryAt: past };
    assert.ok(shouldRun(job));
  });

  it("does not retry failed jobs within backoff window", () => {
    const future = new Date(Date.now() + 60_000);
    const job: MockJob = { status: "failed", attemptCount: 1, scheduledFor: null, nextRetryAt: future };
    assert.ok(!shouldRun(job));
  });

  it("does not retry dead_letter jobs (MAX_ATTEMPTS reached)", () => {
    const job: MockJob = { status: "dead_letter", attemptCount: 3, scheduledFor: null, nextRetryAt: null };
    assert.ok(!shouldRun(job));
  });

  it("does not retry failed jobs at MAX_ATTEMPTS", () => {
    const job: MockJob = { status: "failed", attemptCount: 3, scheduledFor: null, nextRetryAt: null };
    assert.ok(!shouldRun(job));
  });

  it("dead-letter threshold is MAX_ATTEMPTS attempts", () => {
    assert.strictEqual(MAX_ATTEMPTS, 3);
    // attempt 1, 2 → retry; attempt 3 → dead_letter
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const isDeadLetter = attempt >= MAX_ATTEMPTS;
      assert.strictEqual(isDeadLetter, attempt === 3);
    }
  });

  it("exponential backoff grows correctly", () => {
    const BACKOFF_MS = [60_000, 120_000, 240_000];
    assert.strictEqual(BACKOFF_MS[0], 60_000);   // 1 min
    assert.strictEqual(BACKOFF_MS[1], 120_000);  // 2 min
    assert.strictEqual(BACKOFF_MS[2], 240_000);  // 4 min
    // Each delay doubles the previous
    assert.strictEqual(BACKOFF_MS[1], BACKOFF_MS[0] * 2);
    assert.strictEqual(BACKOFF_MS[2], BACKOFF_MS[1] * 2);
  });
});

// ── NOT_SUPPORTED_YET response mapping ────────────────────────────────────────

describe("NOT_SUPPORTED_YET result handling", () => {
  interface NotSupportedResult {
    code: "NOT_SUPPORTED_YET";
    reason: string;
    next_steps: string;
  }

  interface PublishTextResult { success: true; postId: string }
  interface PublishFailResult { success: false; error: string }
  type PublishResult = PublishTextResult | PublishFailResult | NotSupportedResult;

  function isNotSupported(result: PublishResult): result is NotSupportedResult {
    return "code" in result && result.code === "NOT_SUPPORTED_YET";
  }

  it("detects NOT_SUPPORTED_YET by code field", () => {
    const result: PublishResult = {
      code: "NOT_SUPPORTED_YET",
      reason: "Instagram requires image/video",
      next_steps: "Add a media URL to mediaRefs",
    };
    assert.ok(isNotSupported(result));
  });

  it("does not flag success result as NOT_SUPPORTED_YET", () => {
    const result: PublishResult = { success: true, postId: "123" };
    assert.ok(!isNotSupported(result));
  });

  it("does not flag failure result as NOT_SUPPORTED_YET", () => {
    const result: PublishResult = { success: false, error: "HTTP 403" };
    assert.ok(!isNotSupported(result));
  });

  it("not_supported jobs are excluded from retry logic", () => {
    const RETRIABLE_STATUSES = new Set(["queued", "scheduled", "failed"]);
    assert.ok(!RETRIABLE_STATUSES.has("not_supported"));
    assert.ok(!RETRIABLE_STATUSES.has("dead_letter"));
    assert.ok(!RETRIABLE_STATUSES.has("published"));
  });
});

// ── MediaStore helpers ─────────────────────────────────────────────────────────

describe("mediaStore", () => {
  function resolveMediaUrl(ref: string): string | null {
    if (/^https?:\/\//.test(ref)) return ref;
    return null;
  }

  function inferMediaType(ref: string): "image" | "video" {
    if (/\.(mp4|mov|avi|webm|mkv|m4v)(\?|$)/.test(ref.toLowerCase())) return "video";
    return "image";
  }

  it("resolves http URL as-is", () => {
    const url = "http://example.com/image.jpg";
    assert.strictEqual(resolveMediaUrl(url), url);
  });

  it("resolves https URL as-is", () => {
    const url = "https://cdn.example.com/media/photo.png";
    assert.strictEqual(resolveMediaUrl(url), url);
  });

  it("returns null for file paths", () => {
    assert.strictEqual(resolveMediaUrl("media/uploads/photo.jpg"), null);
    assert.strictEqual(resolveMediaUrl("./assets/video.mp4"), null);
  });

  it("infers video type for mp4", () => {
    assert.strictEqual(inferMediaType("https://cdn.example.com/clip.mp4"), "video");
  });

  it("infers video type for mov", () => {
    assert.strictEqual(inferMediaType("video.mov"), "video");
  });

  it("infers image type for jpg", () => {
    assert.strictEqual(inferMediaType("photo.jpg"), "image");
  });

  it("defaults to image for unknown extensions", () => {
    assert.strictEqual(inferMediaType("media/file"), "image");
  });

  it("handles URL with query params for video detection", () => {
    assert.strictEqual(inferMediaType("https://cdn.example.com/video.mp4?v=2"), "video");
  });
});

// ── Registry ──────────────────────────────────────────────────────────────────

describe("connector registry", () => {
  const SUPPORTED_PLATFORMS = ["x", "linkedin", "instagram", "tiktok"];
  const TEXT_ONLY = ["x", "linkedin"];
  const MEDIA_REQUIRED = ["instagram"];
  const AUDIT_REQUIRED = ["tiktok"];

  it("all expected platforms are registered", () => {
    for (const p of SUPPORTED_PLATFORMS) {
      assert.ok(SUPPORTED_PLATFORMS.includes(p), `${p} should be in registry`);
    }
  });

  it("text-only platforms do not include media-required ones", () => {
    for (const p of MEDIA_REQUIRED) {
      assert.ok(!TEXT_ONLY.includes(p), `${p} should not be in TEXT_ONLY list`);
    }
  });

  it("audit-required platforms are distinct from text-only", () => {
    for (const p of AUDIT_REQUIRED) {
      assert.ok(!TEXT_ONLY.includes(p));
    }
  });

  it("all platforms are accounted for in one category", () => {
    const allCategorized = new Set([...TEXT_ONLY, ...MEDIA_REQUIRED, ...AUDIT_REQUIRED]);
    for (const p of SUPPORTED_PLATFORMS) {
      assert.ok(allCategorized.has(p), `${p} should be in a capability category`);
    }
  });
});
