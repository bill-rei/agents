import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { mapToMarketingArtifact, deriveDestination } from "@/lib/artifactMapper";
import { publishViaCli } from "@/lib/publishBridge";
import { createContentItem } from "@/lib/contentItemStore";
import { publishDesignLockedPage } from "@/lib/wp/publishDesignLockedPage";

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
    const siteKey = artifact.run.project.targetRegistryKey;
    const metadata = (artifact.metadata as Record<string, unknown>) || {};
    const brand = deriveBrand(siteKey, metadata);

    // Social posts go through the Zoho bulk CSV export, not the CLI
    if (artifact.type === "social_post") {
      const contentItemId = handleSocialPost(artifact, brand, dryRun);

      await db.publishLog.create({
        data: {
          artifactId: artifact.id,
          userId: user.id,
          destination: `zoho-csv:${brand.toLowerCase()}`,
          result: {
            ok: true,
            dryRun,
            contentItemId: contentItemId || null,
            note: dryRun
              ? "Dry run — ContentItem not created"
              : "ContentItem created for Zoho bulk CSV export",
          },
        },
      });

      if (!dryRun) {
        await db.artifact.update({
          where: { id: artifact.id },
          data: { status: "published" },
        });
      }

      results.push({
        artifactId: artifact.id,
        title: artifact.title,
        ok: true,
        dryRun,
        stdout: dryRun
          ? `[dry-run] Would create ContentItem for Zoho bulk CSV export (${brand})`
          : `ContentItem created for Zoho bulk CSV export (${brand})`,
        contentItemId,
      });
      continue;
    }

    // Check if this artifact uses the design-locked structured format
    const contentFormat = (artifact.metadata as Record<string, unknown>)?.content_format;
    if (artifact.type === "web_page" && contentFormat === "structured") {
      try {
        const target = (artifact.target as Record<string, unknown>) || {};
        const slug = (target.slug || target.page_key) as string;
        if (!slug) {
          results.push({
            artifactId: artifact.id,
            title: artifact.title,
            ok: false,
            dryRun,
            stdout: "Design-locked publish requires a slug in artifact.target",
          });
          continue;
        }

        let structuredContent: unknown;
        try {
          structuredContent = JSON.parse(artifact.content);
        } catch {
          results.push({
            artifactId: artifact.id,
            title: artifact.title,
            ok: false,
            dryRun,
            stdout: "Failed to parse artifact content as JSON for structured publish",
          });
          continue;
        }

        if (dryRun) {
          results.push({
            artifactId: artifact.id,
            title: artifact.title,
            ok: true,
            dryRun: true,
            stdout: `[dry-run] Would design-locked publish to slug "${slug}"`,
          });
          continue;
        }

        const dlResult = await publishDesignLockedPage({
          slug,
          title: artifact.title,
          artifact: structuredContent,
          status: "draft",
        });

        await db.publishLog.create({
          data: {
            artifactId: artifact.id,
            userId: user.id,
            destination: `wp-design-locked:${dlResult.brand}`,
            result: {
              ok: true,
              pageId: dlResult.pageId,
              url: dlResult.url,
              templateId: dlResult.templateId,
              usedAcf: dlResult.usedAcf,
            },
          },
        });

        await db.artifact.update({
          where: { id: artifact.id },
          data: { status: "published" },
        });

        results.push({
          artifactId: artifact.id,
          title: artifact.title,
          ok: true,
          dryRun: false,
          stdout: `Design-locked published to ${dlResult.url} (template ${dlResult.templateId})`,
        });
        continue;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({
          artifactId: artifact.id,
          title: artifact.title,
          ok: false,
          dryRun,
          stdout: `Design-locked publish failed: ${msg}`,
        });
        continue;
      }
    }

    // Web pages and other types go through the CLI
    const marketingArtifact = mapToMarketingArtifact(artifact);
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

// ── Social post handler (Zoho bulk CSV path) ──

function handleSocialPost(
  artifact: {
    title: string;
    content: string;
    artifactAssets?: Array<{ asset: { id: string; mimeType: string } }>;
  },
  brand: "LLIF" | "BestLife",
  dryRun: boolean
): string | undefined {
  if (dryRun) return undefined;

  const socialCaption = deriveSocialCaption(artifact);
  const imageUrls = buildImageUrls(artifact.artifactAssets || []);

  const contentItem = createContentItem({
    brand,
    socialCaption,
    imageUrls,
  });
  return contentItem.id;
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
