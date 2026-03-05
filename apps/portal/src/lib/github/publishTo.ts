/**
 * publishTo — target-key-based publish helper
 *
 * The preferred way to trigger a GitHub PR publish from portal code.
 * Accepts any PublishTargetKey (LLIF, BestLife, SharedContent, …) rather than
 * a hardcoded brand, making it trivial to add new targets without touching
 * call sites.
 *
 * Usage:
 *   import { publishTo } from "@/lib/github/publishTo";
 *
 *   const result = await publishTo("SharedContent", {
 *     title: "Add Q1 campaign assets",
 *     changes: [{ path: "campaigns/2026-03/manifest.json", content: "…" }],
 *     runId: job.id,
 *   });
 */

import type { PublishTargetKey } from "@/lib/publishTargets";
import { createPublishPRForTarget } from "@/lib/publishers/githubPublisher";
import type { PublishChange, GitHubPRResult } from "@/lib/publishers/githubPublisher";

export type { PublishChange, GitHubPRResult };

export async function publishTo(
  target: PublishTargetKey,
  options: {
    title: string;
    description?: string;
    changes: PublishChange[];
    baseBranch?: string;
    runId?: string;
  }
): Promise<GitHubPRResult> {
  return createPublishPRForTarget({ targetKey: target, ...options });
}
