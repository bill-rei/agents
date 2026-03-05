/**
 * POST /api/publish/github
 *
 * Creates a GitHub branch + commit(s) + draft PR for the given set of file changes.
 *
 * Body:
 * {
 *   "runId":       string,                                        // required
 *   "target":      "LLIF" | "BestLife" | "SharedContent",        // preferred
 *   "brand":       "LLIF" | "BestLife",                          // legacy alias for target
 *   "title":       string,                                        // required — PR title
 *   "description": string?,                                       // optional — PR body
 *   "changes":     [{ "path": string, "content": string }],      // required, ≥1
 *   "baseBranch":  string?                                        // optional, default GITHUB_BASE_BRANCH || "main"
 * }
 *
 * Example curl (localhost):
 *
 *   curl -s -X POST http://localhost:4000/api/publish/github \
 *     -H "Content-Type: application/json" \
 *     -H "Cookie: next-auth.session-token=<your-token>" \
 *     -d '{
 *       "runId": "cm_abc123",
 *       "target": "LLIF",
 *       "title": "Homepage Q1 Update",
 *       "changes": [
 *         { "path": "content/pages/homepage.mdx", "content": "# Home\n\nWelcome." }
 *       ]
 *     }'
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { PUBLISH_TARGETS } from "@/lib/publishTargets";
import type { PublishTargetKey } from "@/lib/publishTargets";
import { publishTo } from "@/lib/github/publishTo";
import type { PublishChange } from "@/lib/github/publishTo";

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

  const { runId, target, brand, title, description, changes, baseBranch } = body as {
    runId?: string;
    target?: string;
    brand?: string;  // legacy alias for target
    title?: string;
    description?: string;
    changes?: unknown;
    baseBranch?: string;
  };

  // ── Validate required fields ───────────────────────────────────────────────

  if (!runId || typeof runId !== "string") {
    return NextResponse.json({ error: "runId is required" }, { status: 400 });
  }

  // Accept either `target` (new) or `brand` (legacy)
  const targetKey = (target ?? brand) as PublishTargetKey | undefined;
  if (!targetKey || !(targetKey in PUBLISH_TARGETS)) {
    return NextResponse.json(
      { error: `target must be one of: ${Object.keys(PUBLISH_TARGETS).join(", ")}` },
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
    result = await publishTo(targetKey, {
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
