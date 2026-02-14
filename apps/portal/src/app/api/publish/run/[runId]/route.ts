import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { mapToMarketingArtifact, deriveDestination } from "@/lib/artifactMapper";
import { publishViaCli } from "@/lib/publishBridge";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { runId } = await params;
  const body = await req.json();
  const dryRun = body.dryRun !== false; // default to dry-run for safety
  const artifactIds: string[] | undefined = body.artifactIds;

  // Fetch approved artifacts with project info
  const artifacts = await db.artifact.findMany({
    where: {
      runId,
      status: "approved",
      ...(artifactIds ? { id: { in: artifactIds } } : {}),
    },
    include: {
      run: { include: { project: true } },
      artifactAssets: { include: { asset: true }, orderBy: { order: "asc" } },
    },
  });

  if (artifacts.length === 0) {
    return NextResponse.json({ error: "No approved artifacts to publish" }, { status: 400 });
  }

  const results = [];

  for (const artifact of artifacts) {
    const marketingArtifact = mapToMarketingArtifact(artifact);
    const siteKey = artifact.run.project.targetRegistryKey;

    // Extract page_key from target if present — the CLI resolves it to a slug
    const target = (artifact.target as Record<string, unknown>) || {};
    const pageKey = target.page_key as string | undefined;

    const publishResult = await publishViaCli(marketingArtifact, {
      dryRun,
      siteKey,
      pageKey,
    });

    const log = await db.publishLog.create({
      data: {
        artifactId: artifact.id,
        userId: user.id,
        destination: deriveDestination(artifact),
        result: {
          ok: publishResult.ok,
          stdout: publishResult.stdout,
          stderr: publishResult.stderr,
          exitCode: publishResult.exitCode,
          dryRun,
        },
      },
    });

    if (!dryRun && publishResult.ok) {
      await db.artifact.update({
        where: { id: artifact.id },
        data: { status: "published" },
      });
    }

    results.push({
      artifactId: artifact.id,
      title: artifact.title,
      ok: publishResult.ok,
      dryRun,
      stdout: publishResult.stdout,
      logId: log.id,
    });
  }

  return NextResponse.json({ results });
}
