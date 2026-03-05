/**
 * GitHub PR Publisher
 *
 * Creates a branch, commits file changes, and opens a pull request
 * against a GitHub repo using the REST API.
 *
 * Prefer calling publishTo() from "@/lib/github/publishTo" for new code —
 * it resolves the target repo from the central PUBLISH_TARGETS config.
 *
 * Required env vars:
 *   GITHUB_TOKEN               — PAT with Contents + Pull Requests + Metadata scopes
 *   GITHUB_OWNER               — GitHub org or user (e.g. "livelearninnovate")
 *
 * Per-target repo env vars (see publishTargets.ts):
 *   GITHUB_REPO_LLIF           — Repo name for the LLIF site
 *   GITHUB_REPO_BESTLIFE       — Repo name for the BestLife site
 *   GITHUB_REPO_SHARED_CONTENT — Repo name for shared content
 *
 * Optional env vars:
 *   GITHUB_BASE_BRANCH      — Default base branch (default: "main")
 *   GITHUB_PR_BRANCH_PREFIX — Branch prefix segment (default: "mops")
 */

import {
  PUBLISH_TARGETS,
  resolveBranchPrefix,
  type PublishTargetKey,
} from "@/lib/publishTargets";

export type PublishBrand = "LLIF" | "BestLife";

export interface PublishChange {
  /** Repo-relative path, e.g. "content/pages/about.mdx" */
  path: string;
  /** UTF-8 file content */
  content: string;
}

export interface GitHubPRResult {
  prNumber: number;
  prUrl: string;
  branchName: string;
  repo: string;
  owner: string;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function getEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required environment variable: ${key}`);
  return val;
}

function slugifyBranchSegment(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "update";
}

function dateSegment(): string {
  return new Date().toISOString().slice(0, 10); // "2025-01-15"
}

function buildBranchName(title: string, prefix: string, runId?: string): string {
  const segment = runId
    ? runId.replace(/[^a-z0-9_-]/gi, "").slice(0, 20)
    : dateSegment();
  return `${prefix}/${segment}/${slugifyBranchSegment(title)}`;
}

function b64(content: string): string {
  return Buffer.from(content, "utf-8").toString("base64");
}

// ── GitHub REST API helpers ───────────────────────────────────────────────────

function ghHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function ghFetch(
  token: string,
  method: string,
  url: string,
  body?: unknown
): Promise<{ status: number; data: unknown }> {
  const res = await fetch(url, {
    method,
    headers: ghHeaders(token),
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  // 204 No Content — no body to parse
  if (res.status === 204) return { status: 204, data: null };

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg =
      (data as Record<string, string>).message ||
      `GitHub API error ${res.status} at ${url}`;
    throw new Error(msg);
  }

  return { status: res.status, data };
}

// ── Core steps ────────────────────────────────────────────────────────────────

/** Resolve HEAD SHA of the base branch. */
async function getBaseSha(
  token: string,
  owner: string,
  repo: string,
  baseBranch: string
): Promise<string> {
  const { data } = await ghFetch(
    token,
    "GET",
    `https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${baseBranch}`
  );
  const sha = (data as { object: { sha: string } }).object?.sha;
  if (!sha) throw new Error(`Could not resolve HEAD SHA for branch "${baseBranch}" in ${owner}/${repo}`);
  return sha;
}

/** Create a new branch from the given SHA. */
async function createBranch(
  token: string,
  owner: string,
  repo: string,
  branchName: string,
  sha: string
): Promise<void> {
  await ghFetch(
    token,
    "POST",
    `https://api.github.com/repos/${owner}/${repo}/git/refs`,
    { ref: `refs/heads/${branchName}`, sha }
  );
}

/** Return the blob SHA of an existing file on a branch, or null if absent. */
async function getExistingFileSha(
  token: string,
  owner: string,
  repo: string,
  filePath: string,
  branch: string
): Promise<string | null> {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`,
    { headers: ghHeaders(token) }
  );
  if (res.status === 404) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return null; // best-effort; upsert will fail with a clear error if needed
  return (data as Record<string, string>).sha ?? null;
}

/** Create or update a single file on a branch. */
async function upsertFile(
  token: string,
  owner: string,
  repo: string,
  branchName: string,
  change: PublishChange,
  commitMessage: string
): Promise<void> {
  const existingSha = await getExistingFileSha(token, owner, repo, change.path, branchName);

  await ghFetch(
    token,
    "PUT",
    `https://api.github.com/repos/${owner}/${repo}/contents/${change.path}`,
    {
      message: commitMessage,
      content: b64(change.content),
      branch: branchName,
      ...(existingSha ? { sha: existingSha } : {}),
    }
  );
}

/** Open a pull request and return the PR number and URL. */
async function openPullRequest(
  token: string,
  owner: string,
  repo: string,
  branchName: string,
  baseBranch: string,
  title: string,
  body: string
): Promise<{ number: number; html_url: string }> {
  const { data } = await ghFetch(
    token,
    "POST",
    `https://api.github.com/repos/${owner}/${repo}/pulls`,
    {
      title,
      body,
      head: branchName,
      base: baseBranch,
      draft: true,
    }
  );
  const pr = data as { number: number; html_url: string };
  if (!pr.number) throw new Error("GitHub did not return a PR number — check branch/repo config");
  return pr;
}

// ── Internal core ─────────────────────────────────────────────────────────────

async function _createPR(args: {
  targetKey: PublishTargetKey;
  title: string;
  description?: string;
  changes: PublishChange[];
  baseBranch?: string;
  runId?: string;
}): Promise<GitHubPRResult> {
  const { targetKey, title, description, changes, runId } = args;

  if (!changes || changes.length === 0) {
    throw new Error("No changes provided — at least one file change is required");
  }

  const targetConfig = PUBLISH_TARGETS[targetKey];
  if (!targetConfig) {
    throw new Error(`Unknown publish target: "${targetKey}"`);
  }

  // ── Resolve credentials + repo ───────────────────────────────────────────
  const token = getEnv("GITHUB_TOKEN");
  const owner = getEnv("GITHUB_OWNER");
  const repo = getEnv(targetConfig.repoEnvKey);
  const baseBranch = args.baseBranch || process.env.GITHUB_BASE_BRANCH || "main";
  const branchPrefix = resolveBranchPrefix(targetConfig);

  // ── Build branch name ────────────────────────────────────────────────────
  const branchName = buildBranchName(title, branchPrefix, runId);

  // ── Get base branch HEAD SHA ─────────────────────────────────────────────
  const baseSha = await getBaseSha(token, owner, repo, baseBranch);

  // ── Create branch ────────────────────────────────────────────────────────
  await createBranch(token, owner, repo, branchName, baseSha);

  // ── Commit each change ───────────────────────────────────────────────────
  for (const change of changes) {
    const commitMsg = `${branchPrefix}: update ${change.path} via portal (${runId ?? "no-run-id"})`;
    await upsertFile(token, owner, repo, branchName, change, commitMsg);
  }

  // ── Open the PR ──────────────────────────────────────────────────────────
  const changedPaths = changes.map((c) => `- \`${c.path}\``).join("\n");
  const prBody = [
    description || `Marketing Ops Portal publish — ${title}`,
    "",
    "**Files changed:**",
    changedPaths,
    "",
    runId ? `Portal run: \`${runId}\`` : "",
  ]
    .filter((line) => line !== undefined)
    .join("\n")
    .trim();

  const pr = await openPullRequest(token, owner, repo, branchName, baseBranch, title, prBody);

  return {
    prNumber: pr.number,
    prUrl: pr.html_url,
    branchName,
    repo,
    owner,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Commit a set of file changes to a new branch and open a draft PR.
 * Uses the central PUBLISH_TARGETS config to resolve the target repo.
 *
 * Prefer this over createPublishPR for new code.
 *
 * @param args.targetKey   - Key from PUBLISH_TARGETS ("LLIF" | "BestLife" | "SharedContent")
 * @param args.title       - Human-readable title for the PR
 * @param args.description - Optional PR body / description
 * @param args.changes     - Files to create or update
 * @param args.baseBranch  - Override base branch (defaults to GITHUB_BASE_BRANCH || "main")
 * @param args.runId       - Optional portal run ID used in branch name
 */
export async function createPublishPRForTarget(args: {
  targetKey: PublishTargetKey;
  title: string;
  description?: string;
  changes: PublishChange[];
  baseBranch?: string;
  runId?: string;
}): Promise<GitHubPRResult> {
  return _createPR(args);
}

/**
 * Backward-compatible wrapper — resolves brand to a PublishTargetKey.
 * New code should use createPublishPRForTarget or publishTo() instead.
 *
 * @param args.brand       - "LLIF" or "BestLife"
 */
export async function createPublishPR(args: {
  brand: PublishBrand;
  title: string;
  description?: string;
  changes: PublishChange[];
  baseBranch?: string;
  runId?: string;
}): Promise<GitHubPRResult> {
  const { brand, ...rest } = args;
  return _createPR({ targetKey: brand as PublishTargetKey, ...rest });
}
