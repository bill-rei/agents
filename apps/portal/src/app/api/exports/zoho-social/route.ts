import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { ENABLED_CHANNEL_KEYS, ZOHO_CHANNELS, isLlifBrand } from "@/lib/zohoSocialConfig";
import { formatZohoDate, formatZohoTime, buildCsvContent, buildZipBuffer, type ZohoRow } from "@/lib/zohoExport";
import { getContentItemById } from "@/lib/contentItemStore";

export async function POST(req: NextRequest) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { contentItemId, scheduledAtISO, channels } = body;

  if (!contentItemId) {
    return NextResponse.json({ error: "contentItemId is required" }, { status: 400 });
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

  // Look up content item
  const contentItem = getContentItemById(contentItemId);
  if (!contentItem) {
    return NextResponse.json({ error: "Content item not found" }, { status: 404 });
  }

  // Brand boundary
  if (!isLlifBrand(contentItem.brand)) {
    return NextResponse.json(
      { error: `Brand "${contentItem.brand}" is not eligible for Zoho Social export. Only LLIF is supported.` },
      { status: 403 }
    );
  }

  // Validate image URLs are absolute
  for (const url of contentItem.imageUrls) {
    if (!/^https?:\/\//i.test(url)) {
      return NextResponse.json(
        { error: `Image URL must be absolute http/https: ${url}` },
        { status: 400 }
      );
    }
  }

  // Build row
  const date = formatZohoDate(scheduledAt);
  const time = formatZohoTime(scheduledAt);

  const row: ZohoRow = {
    date,
    time,
    message: contentItem.socialCaption,
    linkUrl: contentItem.canonicalUrl || "",
    imageUrls: contentItem.imageUrls.slice(0, 10),
  };

  // Build one CSV per channel
  const csvFiles = channels.map((channel: string) => {
    const label = ZOHO_CHANNELS.find((c) => c.key === channel)?.label || channel;
    return {
      filename: `${label.replace(/[^a-zA-Z0-9]/g, "_")}.csv`,
      content: buildCsvContent([row]),
    };
  });

  const zipBuffer = await buildZipBuffer(csvFiles);

  return new NextResponse(new Uint8Array(zipBuffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="zoho-social-export.zip"`,
    },
  });
}
