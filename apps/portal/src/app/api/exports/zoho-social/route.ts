import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { ENABLED_CHANNEL_KEYS, ZOHO_CHANNELS, isLlifBrand } from "@/lib/zohoSocialConfig";
import { formatZohoDate, formatZohoTime, buildCsvContent, buildZipBuffer, type ZohoRow } from "@/lib/zohoExport";

const PORTAL_PUBLIC_URL = process.env.PORTAL_PUBLIC_URL || "";

export async function POST(req: NextRequest) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { runId, artifactIds, scheduledAtISO, channels } = body;

  if (!runId) {
    return NextResponse.json({ error: "runId is required" }, { status: 400 });
  }

  // Validate channels
  if (!Array.isArray(channels) || channels.length === 0) {
    return NextResponse.json({ error: "At least one channel is required" }, { status: 400 });
  }
  const invalidChannels = channels.filter((c: string) => !ENABLED_CHANNEL_KEYS.includes(c));
  if (invalidChannels.length > 0) {
    return NextResponse.json(
      { error: `Invalid or disabled channels: ${invalidChannels.join(", ")}` },
      { status: 400 }
    );
  }

  // Validate scheduledAt
  if (!scheduledAtISO) {
    return NextResponse.json({ error: "scheduledAtISO is required" }, { status: 400 });
  }
  const scheduledAt = new Date(scheduledAtISO);
  if (isNaN(scheduledAt.getTime())) {
    return NextResponse.json({ error: "Invalid scheduledAtISO" }, { status: 400 });
  }

  // Fetch approved artifacts
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
    return NextResponse.json({ error: "No approved artifacts found" }, { status: 400 });
  }

  // Brand boundary check
  for (const artifact of artifacts) {
    const metadata = (artifact.metadata as Record<string, unknown>) || {};
    const brand = (metadata.brand as string) || null;
    if (!isLlifBrand(brand)) {
      return NextResponse.json(
        { error: `Artifact "${artifact.title || artifact.id}" has brand "${brand || "(none)"}" — Zoho Social export is only available for LLIF` },
        { status: 403 }
      );
    }
  }

  // Build rows
  const date = formatZohoDate(scheduledAt);
  const time = formatZohoTime(scheduledAt);

  const rows: ZohoRow[] = artifacts.map((artifact) => {
    let contentObj: Record<string, unknown>;
    try {
      contentObj = JSON.parse(artifact.content);
    } catch {
      contentObj = { body: artifact.content };
    }

    const message = String(contentObj.body || contentObj.text || artifact.title || "");
    const linkUrl = String(contentObj.link_url || contentObj.url || "");

    const imageAssets = (artifact.artifactAssets || [])
      .filter((aa) => aa.asset.mimeType.startsWith("image/"))
      .slice(0, 10);

    const imageUrls = PORTAL_PUBLIC_URL
      ? imageAssets.map((aa) => `${PORTAL_PUBLIC_URL}/api/assets/${aa.asset.id}`)
      : [];

    return { date, time, message, linkUrl, imageUrls };
  });

  // Build one CSV per channel
  const csvFiles = channels.map((channel: string) => {
    const label = ZOHO_CHANNELS.find((c) => c.key === channel)?.label || channel;
    return {
      filename: `${label.replace(/[^a-zA-Z0-9]/g, "_")}.csv`,
      content: buildCsvContent(rows),
    };
  });

  const zipBuffer = await buildZipBuffer(csvFiles);

  return new NextResponse(zipBuffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="zoho-social-export.zip"`,
    },
  });
}
