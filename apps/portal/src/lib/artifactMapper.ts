import type { Artifact, Run, Project } from "@prisma/client";

type ArtifactWithRun = Artifact & {
  run: Run & { project: Project };
};

export function mapToMarketingArtifact(dbArtifact: ArtifactWithRun) {
  let contentObj: Record<string, unknown>;
  try {
    contentObj = JSON.parse(dbArtifact.content);
  } catch {
    contentObj = { body: dbArtifact.content };
  }

  const metadata = (dbArtifact.metadata as Record<string, unknown>) || {};
  const target = (dbArtifact.target as Record<string, unknown>) || {};

  return {
    artifact_id: dbArtifact.id,
    brand: (metadata.brand as string) || dbArtifact.run.project.slug,
    artifact_type: dbArtifact.type,
    target,
    content: contentObj,
    status: dbArtifact.status === "approved" ? "draft" : dbArtifact.status,
    provenance: {
      agent: "portal",
      created_at: dbArtifact.createdAt.toISOString(),
    },
    human_approval: dbArtifact.status === "approved",
    ...(metadata.schedule_at ? { schedule_at: metadata.schedule_at } : {}),
  };
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
