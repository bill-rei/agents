import type { Artifact, Run, Project, Asset, ArtifactAsset } from "@prisma/client";
import { getFilePath } from "@/lib/storage";
import { extractWebPageBody } from "@/lib/content/extractWebPageBody";

type ArtifactAssetWithAsset = ArtifactAsset & { asset: Asset };

type ArtifactWithRun = Artifact & {
  run: Run & { project: Project };
  artifactAssets?: ArtifactAssetWithAsset[];
};

/**
 * Map a DB artifact to the marketing-artifact JSON schema expected by
 * the publish CLI (scripts/publish.js).
 *
 * The publish CLI validates against marketing-artifacts/schema.js, so
 * the output must have all required fields populated:
 *   - web_page:    target.platform="wordpress", content.{title, html}
 *   - social_post: target.platform=<platform>,   content.{body}
 *   - blog_post:   target.platform=<platform>,   content.{title, markdown}
 */
export function mapToMarketingArtifact(dbArtifact: ArtifactWithRun, overrideSiteKey?: string) {
  const metadata = (dbArtifact.metadata as Record<string, unknown>) || {};
  const dbTarget = (dbArtifact.target as Record<string, unknown>) || {};
  const siteKey = overrideSiteKey || dbArtifact.run.project.targetRegistryKey;

  // Parse stored content — could be JSON string or plain text
  let contentObj: Record<string, unknown>;
  try {
    contentObj = JSON.parse(dbArtifact.content);
  } catch {
    contentObj = { body: dbArtifact.content };
  }

  // For web_page artifacts, extract and normalise the publishable HTML body.
  // This handles three formats that agents may produce:
  //   1) Raw HTML/markdown pasted directly (normalises literal \n sequences).
  //   2) JSON with a top-level "html" or "body" field.
  //   3) JSON with a "pages" array containing "body_html" or "body_markdown"
  //      (the format produced by several LLM content agents).
  if (dbArtifact.type === "web_page") {
    const selectedSlug = (dbTarget.slug as string) || undefined;
    const extracted = extractWebPageBody(dbArtifact.content, { selectedSlug });
    if (extracted.warnings?.length) {
      console.warn("[artifactMapper] web_page HTML extraction:", extracted.warnings);
    }
    // Override contentObj.html so buildContent() uses the extracted body.
    if (extracted.detected !== "unknown" || extracted.body) {
      contentObj = { ...contentObj, html: extracted.body };
    }
  }

  // Build type-specific target with required fields
  const target = buildTarget(dbArtifact.type, dbTarget, siteKey);

  // Build type-specific content with required fields
  const content = buildContent(dbArtifact.type, contentObj, dbArtifact.title);

  const base = {
    artifact_id: dbArtifact.id,
    brand: (metadata.brand as string) || dbArtifact.run.project.slug,
    artifact_type: dbArtifact.type,
    target,
    content,
    status: dbArtifact.status === "approved" ? "draft" : dbArtifact.status,
    provenance: {
      agent: "portal",
      created_at: dbArtifact.createdAt.toISOString(),
    },
    human_approval: dbArtifact.status === "approved",
    ...(metadata.schedule_at ? { schedule_at: metadata.schedule_at } : {}),
  };

  // Attach media payload if assets are linked
  const artifactAssets = dbArtifact.artifactAssets || [];
  if (artifactAssets.length > 0) {
    const mediaPayload = buildMediaPayload(artifactAssets, content);
    return {
      ...base,
      ...mediaPayload,
      content_format: "html",
    };
  }

  return base;
}

function buildTarget(
  type: string,
  dbTarget: Record<string, unknown>,
  siteKey: string
): Record<string, unknown> {
  switch (type) {
    case "web_page": {
      // page_key is a portal-only field used for --page flag; strip it
      // so it doesn't fail schema validation (additionalProperties: false)
      const { page_key: _, ...rest } = dbTarget;
      return {
        platform: "wordpress",
        site_key: siteKey,
        ...rest, // user overrides (slug, page_id, elementor)
      };
    }
    case "social_post":
      return {
        platform: dbTarget.platform || "x",
        ...dbTarget,
      };
    case "blog_post":
      return {
        platform: dbTarget.platform || "wordpress",
        ...dbTarget,
      };
    default:
      return dbTarget;
  }
}

function buildContent(
  type: string,
  contentObj: Record<string, unknown>,
  title: string
): Record<string, unknown> {
  switch (type) {
    case "web_page":
      return {
        title: contentObj.title || title || "Untitled",
        html: contentObj.html || contentObj.body || String(contentObj.text || ""),
        ...(contentObj.status ? { status: contentObj.status } : {}),
      };
    case "social_post":
      return {
        body: contentObj.body || String(contentObj.text || contentObj.html || ""),
        ...(contentObj.hashtags ? { hashtags: contentObj.hashtags } : {}),
        ...(contentObj.cta ? { cta: contentObj.cta } : {}),
        ...(contentObj.media_urls ? { media_urls: contentObj.media_urls } : {}),
      };
    case "blog_post":
      return {
        title: contentObj.title || title || "Untitled",
        markdown: contentObj.markdown || contentObj.body || String(contentObj.text || ""),
        ...(contentObj.excerpt ? { excerpt: contentObj.excerpt } : {}),
      };
    default:
      return contentObj;
  }
}

// ── Media payload builder ──

function slugify(filename: string): string {
  const name = filename.replace(/\.[^.]+$/, "");
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function buildMediaPayload(
  artifactAssets: ArtifactAssetWithAsset[],
  content: Record<string, unknown>
) {
  const media_assets = artifactAssets.map((aa) => ({
    asset_id: aa.assetId,
    source: "upload" as const,
    upload_path: getFilePath(aa.asset.storagePath),
    intent: aa.intent,
    seo: {
      alt: aa.alt || aa.asset.filename,
      filename_slug: slugify(aa.asset.filename),
      ...(aa.caption ? { caption: aa.caption } : {}),
    },
    geo: {
      llm_description: aa.asset.description || aa.alt || aa.asset.filename,
    },
  }));

  const media_bindings = artifactAssets.map((aa) => ({
    asset_id: aa.assetId,
    placement: aa.placement as "above" | "below" | "inline",
    ...(aa.alignment ? { alignment: aa.alignment } : {}),
    ...(aa.size ? { size: aa.size } : {}),
  }));

  const content_blocks = [
    {
      block_id: "main",
      html: String(content.html || content.body || ""),
      media_bindings,
    },
  ];

  return { media_assets, content_blocks };
}

export function deriveDestination(dbArtifact: ArtifactWithRun, overrideSiteKey?: string): string {
  const target = (dbArtifact.target as Record<string, unknown>) || {};
  if (dbArtifact.type === "web_page") {
    return `wp:${overrideSiteKey || target.site_key || dbArtifact.run.project.targetRegistryKey}`;
  }
  if (dbArtifact.type === "social_post") {
    return `social:${overrideSiteKey || target.platform || "unknown"}`;
  }
  return dbArtifact.type;
}
