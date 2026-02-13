import type { Artifact, Run, Project } from "@prisma/client";

type ArtifactWithRun = Artifact & {
  run: Run & { project: Project };
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
export function mapToMarketingArtifact(dbArtifact: ArtifactWithRun) {
  const metadata = (dbArtifact.metadata as Record<string, unknown>) || {};
  const dbTarget = (dbArtifact.target as Record<string, unknown>) || {};
  const siteKey = dbArtifact.run.project.targetRegistryKey;

  // Parse stored content — could be JSON string or plain text
  let contentObj: Record<string, unknown>;
  try {
    contentObj = JSON.parse(dbArtifact.content);
  } catch {
    contentObj = { body: dbArtifact.content };
  }

  // Build type-specific target with required fields
  const target = buildTarget(dbArtifact.type, dbTarget, siteKey);

  // Build type-specific content with required fields
  const content = buildContent(dbArtifact.type, contentObj, dbArtifact.title);

  return {
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

export function deriveDestination(dbArtifact: ArtifactWithRun): string {
  const target = (dbArtifact.target as Record<string, unknown>) || {};
  if (dbArtifact.type === "web_page") {
    return `wp:${target.site_key || dbArtifact.run.project.targetRegistryKey}`;
  }
  if (dbArtifact.type === "social_post") {
    return `social:${target.platform || "unknown"}`;
  }
  return dbArtifact.type;
}
