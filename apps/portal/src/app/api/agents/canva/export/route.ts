/**
 * POST /api/agents/canva/export
 *
 * End-to-end pipeline:
 *   1. Validate request + brand boundary
 *   2. Load Canva tokens (refresh if expired)
 *   3. Create design via Autofill API (template + fields)
 *   4. Export design as PNG
 *   5. Upload PNG to the correct WordPress Media Library
 *   6. Record CanvaAsset row in DB
 *   7. Return { canvaAsset: { id, wpUrl, wpMediaId, wpSite } }
 *
 * Allowed roles: admin, approver, publisher
 * This is a long-running operation (≤60 s). Do not use on Vercel Hobby.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getCanvaTokens, generateCanvaDesign } from "@/lib/canva/canvaClient";
import { uploadWpMedia } from "@/lib/wp/wpMediaUpload";
import { getTemplate } from "@/config/canvaTemplates";
import type { Brand } from "@/lib/designContract/schema";

export const runtime = "nodejs";
export const maxDuration = 60; // seconds

interface ExportRequest {
  artifactId: string;
  templateKey: string;
  fields: {
    headline?: string;
    subhead?: string;
    cta?: string;
    url?: string;
    version?: string;
    disclaimer?: string;
  };
}

export async function POST(req: NextRequest) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // All authenticated roles may generate visuals
  // (admin, approver, publisher)

  // ── Input validation ────────────────────────────────────────────────────────
  let body: ExportRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { artifactId, templateKey, fields } = body;

  if (!artifactId || !templateKey) {
    return NextResponse.json(
      { error: "artifactId and templateKey are required" },
      { status: 400 }
    );
  }

  if (!fields || typeof fields !== "object") {
    return NextResponse.json({ error: "fields object is required" }, { status: 400 });
  }

  // ── Template lookup ─────────────────────────────────────────────────────────
  const template = getTemplate(templateKey);
  if (!template) {
    return NextResponse.json(
      { error: `Unknown template key: "${templateKey}"` },
      { status: 400 }
    );
  }

  // ── Artifact + brand boundary check ────────────────────────────────────────
  const artifact = await db.artifact.findUnique({
    where: { id: artifactId },
    select: { id: true, target: true, metadata: true },
  });

  if (!artifact) {
    return NextResponse.json({ error: "Artifact not found" }, { status: 404 });
  }

  const artifactBrand = detectBrand(
    artifact.target as Record<string, unknown>,
    artifact.metadata as Record<string, unknown>
  );

  // Enforce brand boundary: template brand must match artifact brand (if detectable)
  if (artifactBrand && artifactBrand !== template.brand) {
    return NextResponse.json(
      {
        error: `Brand boundary violation: artifact is "${artifactBrand}" but template is "${template.brand}"`,
      },
      { status: 422 }
    );
  }

  const wpBrand: Brand = template.brand === "llif" ? "llif" : "bestlife";

  // ── Canva token check ───────────────────────────────────────────────────────
  let tokenData: { accessToken: string } | null;
  try {
    tokenData = await getCanvaTokens();
  } catch (err) {
    return NextResponse.json(
      { error: `Canva token error: ${(err as Error).message}` },
      { status: 500 }
    );
  }

  if (!tokenData) {
    return NextResponse.json(
      { error: "Canva is not connected. An admin must connect Canva first." },
      { status: 503 }
    );
  }

  // ── Create AgentJob record ──────────────────────────────────────────────────
  const job = await db.agentJob.create({
    data: {
      type: "canva_export",
      status: "running",
      input: { artifactId, templateKey, fieldCount: Object.keys(fields).length },
      createdByUserId: user.id,
    },
  });

  // ── Generate design + upload ────────────────────────────────────────────────
  let canvaAsset;
  try {
    // 1. Generate PNG via Canva
    const { bytes, filename } = await generateCanvaDesign({
      templateId: template.templateId,
      fieldKeys: template.fieldKeys,
      fields,
      accessToken: tokenData.accessToken,
    });

    // 2. Upload to the correct WordPress Media Library
    const altText = fields.headline
      ? `${template.name}: ${fields.headline}`
      : template.name;

    const wpMedia = await uploadWpMedia(wpBrand, filename, "image/png", bytes, altText);

    // 3. Record CanvaAsset
    canvaAsset = await db.canvaAsset.create({
      data: {
        artifactId,
        agentJobId: job.id,
        type: "image",
        provider: "canva",
        wpSite: wpBrand,
        wpMediaId: wpMedia.id,
        wpUrl: wpMedia.url,
        meta: {
          templateKey,
          templateName: template.name,
          format: template.format,
          fields,
          filename,
          altText,
        },
        createdByUserId: user.id,
      },
    });

    // 4. Mark job completed
    await db.agentJob.update({
      where: { id: job.id },
      data: {
        status: "completed",
        output: {
          canvaAssetId: canvaAsset.id,
          wpUrl: wpMedia.url,
          wpMediaId: wpMedia.id,
          wpSite: wpBrand,
        },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);

    await db.agentJob.update({
      where: { id: job.id },
      data: {
        status: "failed",
        error: message.slice(0, 2000),
      },
    });

    return NextResponse.json(
      { error: message, jobId: job.id },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    canvaAsset: {
      id: canvaAsset.id,
      wpUrl: canvaAsset.wpUrl,
      wpMediaId: canvaAsset.wpMediaId,
      wpSite: canvaAsset.wpSite,
    },
    jobId: job.id,
  });
}

// ─── Brand detection ──────────────────────────────────────────────────────────

function detectBrand(
  target: Record<string, unknown>,
  metadata: Record<string, unknown>
): Brand | null {
  const siteKey = (target?.site_key ?? target?.siteKey) as string | undefined;
  if (siteKey?.toLowerCase().startsWith("llif")) return "llif";
  if (siteKey?.toLowerCase().startsWith("bestlife")) return "bestlife";
  if (siteKey?.toLowerCase().startsWith("bla")) return "bestlife";

  const brand = (metadata?.brand ?? target?.brand) as string | undefined;
  if (brand === "llif") return "llif";
  if (brand === "bestlife") return "bestlife";

  return null;
}
