import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import {
  runBestLifeSocialJob,
  validateBestLifePublish,
  buildDryRunPreview,
} from "@/lib/publishers/bestlife";
import type { SocialArtifact } from "@/lib/publishers/bestlife/directPublisher";
import { getAllChannelKeys } from "@/lib/publishers/bestlife/channelRegistry";

/**
 * POST /api/publish/bestlife/social
 *
 * Trigger a Best Life social publish job.
 * Body: { artifactId, selectedChannels: string[], dryRun?: boolean, scheduledAt?: string }
 *
 * Guardrails enforced:
 *  - Auth required
 *  - Artifact must exist and be approved/published
 *  - artifact.metadata.brand must be "bestlife"
 *  - selectedChannels must be non-empty
 *  - All channel keys must be valid BestLife channels (no LLIF channels allowed)
 */
export async function POST(req: NextRequest) {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { artifactId, selectedChannels, dryRun = false, scheduledAt } = body as {
    artifactId: string;
    selectedChannels: string[];
    dryRun?: boolean;
    scheduledAt?: string;
  };

  // ── Input validation ──────────────────────────────────────────────────────

  if (!artifactId) {
    return NextResponse.json({ error: "artifactId is required" }, { status: 400 });
  }

  if (!Array.isArray(selectedChannels) || selectedChannels.length === 0) {
    return NextResponse.json(
      { error: "selectedChannels must be a non-empty array" },
      { status: 400 }
    );
  }

  // Detect any channel keys not belonging to Best Life (e.g., LLIF-only keys)
  const knownBestLifeKeys = getAllChannelKeys();
  const unknownKeys = selectedChannels.filter((k) => !knownBestLifeKeys.includes(k));
  if (unknownKeys.length > 0) {
    return NextResponse.json(
      {
        error: `Unknown Best Life channel key(s): ${unknownKeys.join(", ")}. Cannot mix brands.`,
        unknownKeys,
      },
      { status: 400 }
    );
  }

  // ── Fetch artifact ────────────────────────────────────────────────────────

  const dbArtifact = await db.artifact.findUnique({
    where: { id: artifactId },
    include: {
      run: { include: { project: true } },
      artifactAssets: { include: { asset: true }, orderBy: { order: "asc" } },
    },
  });

  if (!dbArtifact) {
    return NextResponse.json({ error: "Artifact not found" }, { status: 404 });
  }

  if (!["approved", "published"].includes(dbArtifact.status)) {
    return NextResponse.json(
      { error: `Artifact must be approved or published. Current status: ${dbArtifact.status}` },
      { status: 422 }
    );
  }

  const metadata = (dbArtifact.metadata as Record<string, unknown>) || {};
  const brand = String(metadata.brand || "").toLowerCase();

  // ── Brand guardrail ───────────────────────────────────────────────────────

  const validationError = validateBestLifePublish(brand, selectedChannels);
  if (validationError) {
    return NextResponse.json({ error: validationError.message }, { status: 403 });
  }

  // ── Build SocialArtifact ──────────────────────────────────────────────────

  let contentObj: Record<string, unknown> = {};
  try {
    contentObj = JSON.parse(dbArtifact.content);
  } catch {
    contentObj = {};
  }

  const body_text = String(contentObj.body || contentObj.excerpt || dbArtifact.title || "");
  const hashtags = (contentObj.hashtags as string[]) || [];
  const linkUrl = (contentObj.cta as Record<string, string>)?.url || undefined;

  const PORTAL_PUBLIC_URL = process.env.PORTAL_PUBLIC_URL || "";
  const mediaUrls = PORTAL_PUBLIC_URL
    ? dbArtifact.artifactAssets
        .filter((aa) => aa.asset.mimeType.startsWith("image/"))
        .map((aa) => `${PORTAL_PUBLIC_URL}/api/assets/${aa.asset.id}`)
    : [];

  const artifact: SocialArtifact = {
    id: dbArtifact.id,
    title: dbArtifact.title,
    body: body_text,
    hashtags,
    mediaUrls,
    linkUrl,
  };

  // ── Dry run — return preview only ─────────────────────────────────────────

  if (dryRun) {
    const preview = buildDryRunPreview(artifact, selectedChannels);
    return NextResponse.json({ dryRun: true, preview });
  }

  // ── Execute ───────────────────────────────────────────────────────────────

  try {
    const job = await runBestLifeSocialJob({
      artifactId,
      brand,
      artifact,
      selectedChannelKeys: selectedChannels,
      projectSlug: dbArtifact.run.project.slug,
      scheduledAt,
      userId: user.id,
    });

    return NextResponse.json(job, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 422 });
  }
}

/**
 * GET /api/publish/bestlife/social?artifactId=...
 * Returns recent publish jobs for an artifact.
 */
export async function GET(req: NextRequest) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const artifactId = req.nextUrl.searchParams.get("artifactId");
  if (!artifactId) {
    return NextResponse.json({ error: "artifactId query param required" }, { status: 400 });
  }

  const jobs = await db.publishJob.findMany({
    where: { artifactId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return NextResponse.json(jobs);
}
