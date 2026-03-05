/**
 * /api/cron/publish — Vercel Cron handler for scheduled publish jobs.
 *
 * Add to vercel.json:
 *   { "crons": [{ "path": "/api/cron/publish", "schedule": "* * * * *" }] }
 *
 * Vercel automatically adds:
 *   Authorization: Bearer {CRON_SECRET}
 *
 * This route simply delegates to /api/publish/run, which handles all job
 * selection (queued + scheduled + failed-retryable) and retry logic.
 */

import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Delegate to the unified job runner
  const runUrl = new URL("/api/publish/run", req.url);
  const runRes = await fetch(runUrl.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cronSecret}`,
    },
    body: "{}",
  });

  const data = await runRes.json().catch(() => ({}));
  return NextResponse.json(data, { status: runRes.status });
}
