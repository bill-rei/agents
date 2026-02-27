/**
 * POST /api/publish/github
 *
 * Creates a GitHub branch + commit(s) + draft PR for the given set of file changes.
 * This is the "GitHub PR" publish target, a first-class alternative to the
 * WordPress Staging legacy path.
 *
 * Body:
 * {
 *   "runId":       string,                           // required
 *   "brand":       "LLIF" | "BestLife",              // required
 *   "title":       string,                           // required — PR title
 *   "description": string?,                          // optional — PR body
 *   "changes":     [{ "path": string, "content": string }],  // required, ≥1
 *   "baseBranch":  string?                           // optional, default GITHUB_BASE_BRANCH || "main"
 * }
 *
 * Example curl (localhost):
 *
 *   curl -s -X POST http://localhost:4000/api/publish/github \
 *     -H "Content-Type: application/json" \
 *     -H "Cookie: next-auth.session-token=<your-token>" \
 *     -d '{
 *       "runId": "cm_abc123",
 *       "brand": "LLIF",
 *       "title": "Homepage Q1 Update",
 *       "changes": [
 *         { "path": "content/pages/homepage.mdx", "content": "# Home\n\nWelcome." }
 *       ]
 *     }'
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { createPublishPR } from "@/lib/publishers/githubPublisher";
import type { PublishBrand, PublishChange } from "@/lib/publishers/githubPublisher";

export async function POST(req: NextRequest) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { runId, brand, title, description, changes, baseBranch } = body as {
    runId?: string;
    brand?: string;
    title?: string;
    description?: string;
    changes?: unknown;
    baseBranch?: string;
  };

  // ── Validate required fields ───────────────────────────────────────────────

  if (!runId || typeof runId !== "string") {
    return NextResponse.json({ error: "runId is required" }, { status: 400 });
  }

  if (brand !== "LLIF" && brand !== "BestLife") {
    return NextResponse.json(
      { error: 'brand must be "LLIF" or "BestLife"' },
      { status: 400 }
    );
  }

  if (!title || typeof title !== "string" || !title.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  if (!Array.isArray(changes) || changes.length === 0) {
    return NextResponse.json(
      { error: "changes must be a non-empty array of { path, content } objects" },
      { status: 400 }
    );
  }

  const typedChanges: PublishChange[] = [];
  for (let i = 0; i < changes.length; i++) {
    const c = changes[i] as Record<string, unknown>;
    if (typeof c?.path !== "string" || !c.path.trim()) {
      return NextResponse.json(
        { error: `changes[${i}].path must be a non-empty string` },
        { status: 400 }
      );
    }
    if (typeof c?.content !== "string") {
      return NextResponse.json(
        { error: `changes[${i}].content must be a string` },
        { status: 400 }
      );
    }
    typedChanges.push({ path: c.path.trim(), content: c.content });
  }

  // ── Call the publisher ─────────────────────────────────────────────────────

  let result;
  try {
    result = await createPublishPR({
      brand: brand as PublishBrand,
      title: title.trim(),
      description,
      changes: typedChanges,
      baseBranch,
      runId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 502 });
  }

  return NextResponse.json({
    prUrl: result.prUrl,
    prNumber: result.prNumber,
    branchName: result.branchName,
    repo: result.repo,
    owner: result.owner,
  });
}
