/**
 * GitHub PR Publisher
 *
 * Creates a branch, commits file changes, and opens a pull request
 * against a Next.js site repo on GitHub using the REST API.
 *
 * Required env vars:
 *   GITHUB_TOKEN        — Personal access token with repo scope
 *   GITHUB_OWNER        — GitHub org or user (e.g. "acme-corp")
 *   GITHUB_REPO_LLIF    — Repo name for LLIF (e.g. "llif-site")
 *   GITHUB_REPO_BESTLIFE— Repo name for BestLife (e.g. "bestlife-site")
 *
 * Optional env vars:
 *   GITHUB_BASE_BRANCH  — Default base branch (default: "main")
 */

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

function buildBranchName(title: string, runId?: string): string {
  const segment = runId
    ? runId.replace(/[^a-z0-9_-]/gi, "").slice(0, 20)
    : dateSegment();
  return `mops/${segment}/${slugifyBranchSegment(title)}`;
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

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Commit a set of file changes to a new branch and open a draft PR.
 *
 * @param args.brand       - "LLIF" or "BestLife" — determines target repo
 * @param args.title       - Human-readable title for the PR
 * @param args.description - Optional PR body / description
 * @param args.changes     - Files to create or update
 * @param args.baseBranch  - Override base branch (defaults to GITHUB_BASE_BRANCH || "main")
 * @param args.runId       - Optional portal run ID used in branch name
 */
export async function createPublishPR(args: {
  brand: PublishBrand;
  title: string;
  description?: string;
  changes: PublishChange[];
  baseBranch?: string;
  runId?: string;
}): Promise<GitHubPRResult> {
  const { brand, title, description, changes, runId } = args;

  if (!changes || changes.length === 0) {
    throw new Error("No changes provided — at least one file change is required");
  }

  // ── Resolve credentials + repo ───────────────────────────────────────────
  const token = getEnv("GITHUB_TOKEN");
  const owner = getEnv("GITHUB_OWNER");
  const repoEnvKey = brand === "LLIF" ? "GITHUB_REPO_LLIF" : "GITHUB_REPO_BESTLIFE";
  const repo = getEnv(repoEnvKey);
  const baseBranch = args.baseBranch || process.env.GITHUB_BASE_BRANCH || "main";

  // ── Build branch name ────────────────────────────────────────────────────
  const branchName = buildBranchName(title, runId);

  // ── Get base branch HEAD SHA ─────────────────────────────────────────────
  const baseSha = await getBaseSha(token, owner, repo, baseBranch);

  // ── Create branch ────────────────────────────────────────────────────────
  await createBranch(token, owner, repo, branchName, baseSha);

  // ── Commit each change ───────────────────────────────────────────────────
  for (const change of changes) {
    const commitMsg = `mops: update ${change.path} via portal (${runId ?? "no-run-id"})`;
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
