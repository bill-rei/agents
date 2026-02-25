import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { getWpCredentials } from "@/lib/wp/wpClient";
import {
  publishWebsiteJobPages,
  computePostPublishJobStatus,
} from "@/lib/wp/websiteJob";
import type { WebJobMetadata, WebJobPage } from "@/lib/wp/websiteJob";
import type { Brand } from "@/lib/designContract/schema";

type Params = { params: Promise<{ artifactId: string }> };

const LOG_PATH = path.join(process.cwd(), "data", "website-job-publish.jsonl");

function appendLog(entry: Record<string, unknown>) {
  try {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + "\n", "utf8");
  } catch {
    // Non-fatal — log but don't fail the publish
    console.error("[website-job] Failed to write publish log");
  }
}

/**
 * POST /api/publish/website-job/[artifactId]
 *
 * Publishes all approved pages in the website job to WordPress staging.
 *
 * Body: { dryRun?: boolean, retryFailed?: boolean }
 *
 * - dryRun=true  → returns the list of pages that would be published (no WP calls)
 * - retryFailed=true → only re-attempts pages with publishStatus="failed"
 */
export async function POST(req: NextRequest, { params }: Params) {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { artifactId } = await params;
  const artifact = await db.artifact.findUnique({ where: { id: artifactId } });

  if (!artifact || artifact.type !== "web_site_update") {
    return NextResponse.json({ error: "Website job not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const dryRun = body.dryRun === true;
  const retryFailed = body.retryFailed === true;

  const meta = artifact.metadata as unknown as WebJobMetadata;

  // Select pages to publish
  let pagesToPublish: WebJobPage[];
  if (retryFailed) {
    pagesToPublish = meta.pages.filter(
      (p) => p.approvalStatus === "approved" && p.publishStatus === "failed"
    );
    if (pagesToPublish.length === 0) {
      return NextResponse.json({ error: "No failed pages to retry" }, { status: 400 });
    }
  } else {
    pagesToPublish = meta.pages.filter((p) => p.approvalStatus === "approved");
    if (pagesToPublish.length === 0) {
      return NextResponse.json(
        { error: "No approved pages to publish. Approve at least one page first." },
        { status: 400 }
      );
    }
  }

  // Dry-run: return preview only
  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      pagesToPublish: pagesToPublish.map((p) => ({
        source_key: p.source_key,
        title: p.title,
        targetSlug: p.targetSlug,
        wpPageId: p.wpPageId,
        action: p.wpPageId ? "update" : "create",
      })),
    });
  }

  // Resolve WP credentials
  let creds;
  try {
    creds = getWpCredentials(meta.brand as Brand);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }

  // Mark job as PUBLISHING
  meta.jobStatus = "PUBLISHING";
  await db.artifact.update({
    where: { id: artifactId },
    data: { metadata: meta as object },
  });

  // Run the batch publish
  const results = await publishWebsiteJobPages(pagesToPublish, creds);

  // Apply results back to metadata.pages
  const resultMap = new Map(results.map((r) => [r.source_key, r]));
  meta.pages = meta.pages.map((p) => {
    const r = resultMap.get(p.source_key);
    if (!r) return p;
    return {
      ...p,
      wpPageId: r.wpPageId ?? p.wpPageId,
      publishStatus: r.ok ? "ok" : "failed",
      publishResult: r,
    };
  });

  // Compute final job status from all approved pages (not just this batch)
  const allApprovedResults = meta.pages
    .filter((p) => p.approvalStatus === "approved")
    .map((p) => ({ source_key: p.source_key, ok: p.publishStatus === "ok" }));

  const jobStatus = computePostPublishJobStatus(
    allApprovedResults.map((r) => ({ ...r, ok: r.ok }))
  );
  meta.jobStatus = jobStatus;

  // Sync artifact.status
  const artifactStatus =
    jobStatus === "PUBLISHED" ? "published" : artifact.status;

  await db.artifact.update({
    where: { id: artifactId },
    data: {
      metadata: meta as object,
      status: artifactStatus,
    },
  });

  // Create PublishLog record
  await db.publishLog.create({
    data: {
      artifactId,
      userId: user.id,
      destination: meta.siteKey,
      result: JSON.parse(JSON.stringify({
        jobStatus,
        pagesAttempted: results.length,
        pagesOk: results.filter((r) => r.ok).length,
        pagesFailed: results.filter((r) => !r.ok).length,
        results,
      })),
    },
  });

  // Append JSONL log
  appendLog({
    timestamp: new Date().toISOString(),
    artifact_id: artifactId,
    run_id: artifact.runId,
    site_key: meta.siteKey,
    job_status: jobStatus,
    pages_attempted: results.length,
    pages_ok: results.filter((r) => r.ok).length,
    pages_failed: results.filter((r) => !r.ok).length,
    results,
  });

  return NextResponse.json({ jobStatus, results });
}
