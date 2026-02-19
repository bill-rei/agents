import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";

/**
 * GET /api/publish/bestlife/jobs/[jobId]/assist-pack
 *
 * Download the assist pack JSON for a publish job.
 * Append ?format=md to get the Markdown summary instead.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { jobId } = await params;
  const format = req.nextUrl.searchParams.get("format") || "json";

  const job = await db.publishJob.findUnique({ where: { id: jobId } });
  if (!job) {
    return NextResponse.json({ error: "Publish job not found" }, { status: 404 });
  }

  if (!job.assistPackPath) {
    return NextResponse.json(
      { error: "No assist pack generated for this job" },
      { status: 404 }
    );
  }

  const storagePath =
    format === "md"
      ? job.assistPackPath.replace(/\.json$/, ".md")
      : job.assistPackPath;

  const fullPath = path.resolve(UPLOAD_DIR, storagePath);

  if (!fs.existsSync(fullPath)) {
    return NextResponse.json({ error: "Assist pack file not found on disk" }, { status: 404 });
  }

  const content = fs.readFileSync(fullPath);
  const contentType = format === "md" ? "text/markdown" : "application/json";
  const filename = `bestlife-assist-pack-${jobId.slice(0, 8)}.${format}`;

  return new NextResponse(content, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
