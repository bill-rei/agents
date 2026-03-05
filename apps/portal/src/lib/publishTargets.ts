/**
 * Publish Targets
 *
 * Central config for all GitHub repositories the portal can publish to.
 * Add a new entry here to support a new target — no other file changes needed
 * (beyond any UI that needs to expose it).
 *
 * Required env vars per target:
 *   GITHUB_REPO_LLIF           — repo name for the LLIF site (e.g. "llif-site")
 *   GITHUB_REPO_BESTLIFE       — repo name for the BestLife site (e.g. "bestlife-site")
 *   GITHUB_REPO_SHARED_CONTENT — repo name for marketing-ops-shared-content
 *
 * Shared env vars (all targets):
 *   GITHUB_TOKEN               — PAT with Contents + Pull Requests + Metadata scopes
 *   GITHUB_OWNER               — GitHub org / user (e.g. "livelearninnovate")
 *   GITHUB_BASE_BRANCH         — Default base branch (default: "main")
 *   GITHUB_PR_BRANCH_PREFIX    — Branch prefix segment (default: "mops")
 */

export type PublishTargetKey = "LLIF" | "BestLife" | "SharedContent";

export interface PublishTarget {
  /** Human-readable label shown in UI and PR bodies. */
  label: string;
  /** Name of the environment variable that holds the GitHub repo name. */
  repoEnvKey: string;
  /**
   * Optional branch prefix override for this target.
   * Falls back to GITHUB_PR_BRANCH_PREFIX env var, then "mops".
   */
  branchPrefix?: string;
}

export const PUBLISH_TARGETS: Record<PublishTargetKey, PublishTarget> = {
  LLIF: {
    label: "LLIF Site",
    repoEnvKey: "GITHUB_REPO_LLIF",
  },
  BestLife: {
    label: "BestLife Site",
    repoEnvKey: "GITHUB_REPO_BESTLIFE",
  },
  SharedContent: {
    label: "Shared Content",
    repoEnvKey: "GITHUB_REPO_SHARED_CONTENT",
  },
};

/** Resolve the configured branch prefix (target-level → env var → hardcoded default). */
export function resolveBranchPrefix(target: PublishTarget): string {
  return target.branchPrefix ?? process.env.GITHUB_PR_BRANCH_PREFIX ?? "mops";
}
