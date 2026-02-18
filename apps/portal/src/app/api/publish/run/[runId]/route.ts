import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { mapToMarketingArtifact, deriveDestination } from "@/lib/artifactMapper";
import { publishViaCli } from "@/lib/publishBridge";
import { createContentItem } from "@/lib/contentItemStore";

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

    let contentItemId: string | undefined;

    if (!dryRun && publishResult.ok) {
      await db.artifact.update({
        where: { id: artifact.id },
        data: { status: "published" },
      });

      // Create a ContentItem record for Zoho export
      const metadata = (artifact.metadata as Record<string, unknown>) || {};
      const brand = deriveBrand(siteKey, metadata);
      const socialCaption = deriveSocialCaption(artifact);
      const canonicalUrl = extractCanonicalUrl(publishResult.stdout);
      const imageUrls = buildImageUrls(artifact.artifactAssets || []);

      const contentItem = createContentItem({
        brand,
        socialCaption,
        canonicalUrl,
        imageUrls,
      });
      contentItemId = contentItem.id;
    }

    results.push({
      artifactId: artifact.id,
      title: artifact.title,
      ok: publishResult.ok,
      dryRun,
      stdout: publishResult.stdout,
      logId: log.id,
      contentItemId,
    });
  }

  return NextResponse.json({ results });
}

// ── Helpers for ContentItem creation ──

function deriveBrand(
  siteKey: string,
  metadata: Record<string, unknown>
): "LLIF" | "BestLife" {
  if (metadata.brand) {
    return String(metadata.brand).toLowerCase() === "llif" ? "LLIF" : "BestLife";
  }
  return siteKey.startsWith("llif") ? "LLIF" : "BestLife";
}

function deriveSocialCaption(artifact: {
  title: string;
  content: string;
}): string {
  let contentObj: Record<string, unknown>;
  try {
    contentObj = JSON.parse(artifact.content);
  } catch {
    contentObj = {};
  }
  // Prefer body (social), then excerpt, then title
  return String(
    contentObj.body || contentObj.excerpt || artifact.title || ""
  );
}

function extractCanonicalUrl(stdout: string): string | undefined {
  // The WP adapter prints the page link in stdout, e.g.:
  //   Published page 123 on llif-staging -> https://staging.example.com/page/
  const match = stdout.match(/-> (https?:\/\/\S+)/);
  return match?.[1];
}

const PORTAL_PUBLIC_URL = process.env.PORTAL_PUBLIC_URL || "";

function buildImageUrls(
  artifactAssets: Array<{ asset: { id: string; mimeType: string } }>
): string[] {
  if (!PORTAL_PUBLIC_URL) return [];
  return artifactAssets
    .filter((aa) => aa.asset.mimeType.startsWith("image/"))
    .map((aa) => `${PORTAL_PUBLIC_URL}/api/assets/${aa.asset.id}`);
}
