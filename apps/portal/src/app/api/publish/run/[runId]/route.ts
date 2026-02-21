import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { mapToMarketingArtifact, deriveDestination } from "@/lib/artifactMapper";
import { publishViaCli } from "@/lib/publishBridge";
import { createContentItem } from "@/lib/contentItemStore";
import { publishDesignLockedPage } from "@/lib/wp/publishDesignLockedPage";
import { getWpCredentials, basicAuthHeader, getPageIdBySlug, updatePage } from "@/lib/wp/wpClient";
import { getTargetsForArtifactType, getTargetType, deriveBrandFromTarget } from "@/lib/targetRegistry";
import type { TargetRegistry } from "@/lib/targetRegistry";
import { runBestLifeSocialJob } from "@/lib/publishers/bestlife";
import type { SocialArtifact } from "@/lib/publishers/bestlife/directPublisher";
import { getAllChannelKeys as getBestLifeChannelKeys } from "@/lib/publishers/bestlife/channelRegistry";

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

  const results: Record<string, unknown>[] = [];

  for (const artifact of artifacts) {
    const project = artifact.run.project;
    const metadata = (artifact.metadata as Record<string, unknown>) || {};

    // Fetch any video assets generated for this artifact (with a WP URL)
    const videoAssets = await db.videoAsset.findMany({
      where: { artifactId: artifact.id, wpUrl: { not: null } },
      select: { variantId: true, aspectRatio: true, durationSeconds: true, wpUrl: true, wpMediaId: true, brand: true },
    });
    // Serialised value stored under WP meta key llif_videos
    const llifVideosMeta = videoAssets.length > 0
      ? JSON.stringify(videoAssets.map((v) => ({
          variant_id: v.variantId,
          aspect_ratio: v.aspectRatio,
          duration_seconds: v.durationSeconds,
          wp_url: v.wpUrl,
          wp_media_id: v.wpMediaId,
          brand: v.brand,
        })))
      : undefined;

    // Resolve target keys — prefer new array field, fall back to legacy single key
    const targetKeys = project.targetRegistryKeys.length > 0
      ? project.targetRegistryKeys
      : [project.targetRegistryKey];

    // Filter targets relevant to this artifact type
    let relevantTargets: TargetRegistry[];
    try {
      relevantTargets = getTargetsForArtifactType(targetKeys, artifact.type);
    } catch {
      // If target JSON files not found, fall back to legacy single-key behavior
      relevantTargets = [];
    }

    // Fallback: if no typed targets resolved, use the legacy single-key path
    if (relevantTargets.length === 0) {
      const siteKey = project.targetRegistryKey;
      const brand = deriveBrand(siteKey, metadata);

      if (artifact.type === "social_post") {
        const result = await publishSocialPost(artifact, brand, dryRun, user.id);
        results.push(result);
      } else {
        const result = await publishWebArtifact(artifact, siteKey, brand, metadata, dryRun, user.id, llifVideosMeta);
        results.push(result);
      }
      continue;
    }

    // Fan-out: publish to each relevant target
    let allOk = true;

    for (const target of relevantTargets) {
      const targetType = getTargetType(target);
      const brand = deriveBrandForDisplay(deriveBrandFromTarget(target));

      if (artifact.type === "social_post" && targetType === "social") {
        const result = await publishSocialPost(artifact, brand, dryRun, user.id, target.site_key);
        if (!result.ok) allOk = false;
        results.push(result);
      } else if (targetType === "web") {
        const result = await publishWebArtifact(
          artifact, target.site_key, brand, metadata, dryRun, user.id, llifVideosMeta
        );
        if (!result.ok) allOk = false;
        results.push(result);
      }
    }

    // Only mark artifact as published if all targets succeeded and not dry-run
    if (!dryRun && allOk) {
      await db.artifact.update({
        where: { id: artifact.id },
        data: { status: "published" },
      });
    }
  }

  return NextResponse.json({ results });
}

// ── Social post publishing — brand-routed ────────────────────────────────────

async function publishSocialPost(
  artifact: {
    id: string;
    title: string;
    content: string;
    run: { project: { slug: string } };
    artifactAssets?: Array<{ asset: { id: string; mimeType: string } }> | null;
  },
  brand: "LLIF" | "BestLife",
  dryRun: boolean,
  userId: string,
  targetSiteKey?: string,
): Promise<Record<string, unknown>> {
  // ── Best Life → Direct publish + Assist Pack ──────────────────────────────
  if (brand === "BestLife") {
    return publishBestLifeSocial(artifact, dryRun, userId);
  }

  // ── LLIF → Zoho bulk CSV path (unchanged) ────────────────────────────────
  const contentItemId = dryRun ? undefined : createSocialContentItem(artifact, brand);

  await db.publishLog.create({
    data: {
      artifactId: artifact.id,
      userId,
      destination: `zoho-csv:${targetSiteKey || brand.toLowerCase()}`,
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

  return {
    artifactId: artifact.id,
    title: artifact.title,
    ok: true,
    dryRun,
    target: targetSiteKey || `zoho-csv:${brand.toLowerCase()}`,
    stdout: dryRun
      ? `[dry-run] Would create ContentItem for Zoho bulk CSV export (${brand})`
      : `ContentItem created for Zoho bulk CSV export (${brand})`,
    contentItemId,
  };
}

// ── Best Life social publish (fan-out via publish run) ────────────────────────

async function publishBestLifeSocial(
  artifact: {
    id: string;
    title: string;
    content: string;
    run: { project: { slug: string } };
    artifactAssets?: Array<{ asset: { id: string; mimeType: string } }> | null;
  },
  dryRun: boolean,
  userId: string,
): Promise<Record<string, unknown>> {
  // Build SocialArtifact from DB artifact
  let contentObj: Record<string, unknown> = {};
  try {
    contentObj = JSON.parse(artifact.content);
  } catch {
    contentObj = {};
  }

  const body = String(contentObj.body || contentObj.excerpt || artifact.title || "");
  const hashtags = (contentObj.hashtags as string[]) || [];
  const linkUrl = (contentObj.cta as Record<string, string>)?.url || undefined;

  const PORTAL_PUBLIC_URL = process.env.PORTAL_PUBLIC_URL || "";
  const mediaUrls = PORTAL_PUBLIC_URL
    ? (artifact.artifactAssets || [])
        .filter((aa) => aa.asset.mimeType.startsWith("image/"))
        .map((aa) => `${PORTAL_PUBLIC_URL}/api/assets/${aa.asset.id}`)
    : [];

  const socialArtifact: SocialArtifact = {
    id: artifact.id,
    title: artifact.title,
    body,
    hashtags,
    mediaUrls,
    linkUrl,
  };

  if (dryRun) {
    return {
      artifactId: artifact.id,
      title: artifact.title,
      ok: true,
      dryRun: true,
      target: "bestlife-direct+assist",
      stdout: `[dry-run] Would publish BestLife social to: ${getBestLifeChannelKeys().join(", ")}`,
    };
  }

  try {
    const job = await runBestLifeSocialJob({
      artifactId: artifact.id,
      brand: "bestlife",
      artifact: socialArtifact,
      selectedChannelKeys: getBestLifeChannelKeys(), // fan-out: all channels
      projectSlug: artifact.run.project.slug,
      userId,
    });

    return {
      artifactId: artifact.id,
      title: artifact.title,
      ok: job.status !== "failed",
      dryRun: false,
      target: "bestlife-direct+assist",
      stdout: `BestLife publish job ${job.id}: ${job.status}`,
      publishJobId: job.id,
      assistPackPath: job.assistPackPath,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      artifactId: artifact.id,
      title: artifact.title,
      ok: false,
      dryRun: false,
      target: "bestlife-direct+assist",
      stdout: `BestLife publish failed: ${msg}`,
    };
  }
}

function createSocialContentItem(
  artifact: {
    title: string;
    content: string;
    artifactAssets?: Array<{ asset: { id: string; mimeType: string } }> | null;
  },
  brand: "LLIF" | "BestLife"
): string {
  const socialCaption = deriveSocialCaption(artifact);
  const imageUrls = buildImageUrls(artifact.artifactAssets || []);

  const contentItem = createContentItem({
    brand,
    socialCaption,
    imageUrls,
  });
  return contentItem.id;
}

// ── Web artifact publishing ──

async function publishWebArtifact(
  artifact: {
    id: string;
    title: string;
    content: string;
    type: string;
    status: string;
    metadata: unknown;
    target: unknown;
    createdAt: Date;
    run: { project: { targetRegistryKey: string; slug: string } };
    artifactAssets?: Array<{
      asset: { id: string; mimeType: string; filename: string; storagePath: string; description: string | null };
      assetId: string;
      intent: string;
      alt: string | null;
      caption: string | null;
      placement: string;
      alignment: string | null;
      size: string | null;
    }> | null;
  },
  siteKey: string,
  brand: "LLIF" | "BestLife",
  metadata: Record<string, unknown>,
  dryRun: boolean,
  userId: string,
  /** JSON-serialised llif_videos array to store as WP meta. Omitted when no videos exist. */
  llifVideosMeta?: string,
): Promise<Record<string, unknown>> {
  // Check if this artifact uses the design-locked structured format
  const contentFormat = metadata.content_format;
  if (artifact.type === "web_page" && contentFormat === "structured") {
    return publishDesignLocked(artifact, dryRun, userId, llifVideosMeta);
  }

  // Standard web/blog publish via CLI
  const marketingArtifact = mapToMarketingArtifact(artifact as Parameters<typeof mapToMarketingArtifact>[0], siteKey);
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
      userId,
      destination: deriveDestination(artifact as Parameters<typeof deriveDestination>[0], siteKey),
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

    // Best-effort: patch llif_videos into WP meta after the page is live
    if (llifVideosMeta) {
      const slug = (target.slug || target.page_key) as string | undefined;
      if (slug) {
        await patchWpVideoMeta(brand, slug, llifVideosMeta).catch((err: unknown) => {
          console.warn(`[publish] llif_videos WP meta patch failed for slug "${slug}":`, err);
        });
      }
    }
  }

  return {
    artifactId: artifact.id,
    title: artifact.title,
    ok: publishResult.ok,
    dryRun,
    target: siteKey,
    stdout: publishResult.stdout,
    logId: log.id,
    contentItemId,
  };
}

// ── Design-locked structured publish ──

async function publishDesignLocked(
  artifact: { id: string; title: string; content: string; target: unknown },
  dryRun: boolean,
  userId: string,
  llifVideosMeta?: string,
): Promise<Record<string, unknown>> {
  try {
    const target = (artifact.target as Record<string, unknown>) || {};
    const slug = (target.slug || target.page_key) as string;
    if (!slug) {
      return {
        artifactId: artifact.id,
        title: artifact.title,
        ok: false,
        dryRun,
        stdout: "Design-locked publish requires a slug in artifact.target",
      };
    }

    let structuredContent: unknown;
    try {
      structuredContent = JSON.parse(artifact.content);
    } catch {
      return {
        artifactId: artifact.id,
        title: artifact.title,
        ok: false,
        dryRun,
        stdout: "Failed to parse artifact content as JSON for structured publish",
      };
    }

    if (dryRun) {
      return {
        artifactId: artifact.id,
        title: artifact.title,
        ok: true,
        dryRun: true,
        stdout: `[dry-run] Would design-locked publish to slug "${slug}"`,
      };
    }

    const dlResult = await publishDesignLockedPage({
      slug,
      title: artifact.title,
      artifact: structuredContent,
      status: "draft",
      ...(llifVideosMeta ? { additionalMeta: { llif_videos: llifVideosMeta } } : {}),
    });

    await db.publishLog.create({
      data: {
        artifactId: artifact.id,
        userId,
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

    return {
      artifactId: artifact.id,
      title: artifact.title,
      ok: true,
      dryRun: false,
      stdout: `Design-locked published to ${dlResult.url} (template ${dlResult.templateId})`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      artifactId: artifact.id,
      title: artifact.title,
      ok: false,
      dryRun,
      stdout: `Design-locked publish failed: ${msg}`,
    };
  }
}

// ── Helpers ──

function deriveBrand(
  siteKey: string,
  metadata: Record<string, unknown>
): "LLIF" | "BestLife" {
  if (metadata.brand) {
    return String(metadata.brand).toLowerCase() === "llif" ? "LLIF" : "BestLife";
  }
  return siteKey.startsWith("llif") ? "LLIF" : "BestLife";
}

function deriveBrandForDisplay(brand: string): "LLIF" | "BestLife" {
  return brand.toLowerCase() === "llif" ? "LLIF" : "BestLife";
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
  return String(
    contentObj.body || contentObj.excerpt || artifact.title || ""
  );
}

function extractCanonicalUrl(stdout: string): string | undefined {
  const match = stdout.match(/-> (https?:\/\/\S+)/);
  return match?.[1];
}

const PORTAL_PUBLIC_URL = process.env.PORTAL_PUBLIC_URL || "";

function buildImageUrls(
  artifactAssets: Array<{ asset: { id: string; mimeType: string } }> | null
): string[] {
  if (!PORTAL_PUBLIC_URL || !artifactAssets) return [];
  return artifactAssets
    .filter((aa) => aa.asset.mimeType.startsWith("image/"))
    .map((aa) => `${PORTAL_PUBLIC_URL}/api/assets/${aa.asset.id}`);
}

async function patchWpVideoMeta(
  brand: "LLIF" | "BestLife",
  slug: string,
  llifVideosMeta: string,
): Promise<void> {
  const wpBrand = brand === "LLIF" ? "llif" : "bestlife";
  const creds = getWpCredentials(wpBrand);
  const auth = basicAuthHeader(creds.username, creds.appPassword);
  const pageId = await getPageIdBySlug(creds.baseUrl, auth, slug);
  if (!pageId) return;
  await updatePage(creds.baseUrl, auth, pageId, { meta: { llif_videos: llifVideosMeta } });
}
