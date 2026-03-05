import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getUCSMessage, saveRenders } from "@/lib/ucs/storage";
import { renderLinkedIn } from "@/lib/ucs/renderers/linkedin";
import { renderX } from "@/lib/ucs/renderers/x";
import { renderInstagram } from "@/lib/ucs/renderers/instagram";
import { renderTikTok } from "@/lib/ucs/renderers/tiktok";
import { renderRedditExport } from "@/lib/ucs/renderers/redditExport";
import { renderWebsite } from "@/lib/ucs/renderers/website";
import type { UCSBrandMode } from "@/lib/ucs/schema";

export interface RenderLogEntry {
  ts: string;
  level: "info" | "warn" | "error";
  message: string;
}

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  await requireAuth();

  const msg = await getUCSMessage(params.id);
  if (!msg) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const log: RenderLogEntry[] = [];
  const ts = () => new Date().toISOString();

  function info(message: string) { log.push({ ts: ts(), level: "info", message }); }
  function warn(message: string) { log.push({ ts: ts(), level: "warn", message }); }

  info(`Starting render pipeline for "${msg.title}" [${msg.brandMode}]`);
  info(`Applying ${msg.brandMode} brand rules…`);

  const brand = msg.brandMode as UCSBrandMode;
  const c = msg.canonical;
  const ov = msg.overrides;
  const renders: Record<string, string> = {};

  // LinkedIn
  try {
    renders.linkedin = renderLinkedIn(c, ov.linkedin, brand);
    info(`✓ LinkedIn render complete (${renders.linkedin.length} chars)`);
  } catch (e) {
    warn(`LinkedIn render failed: ${String(e)}`);
  }

  // X
  try {
    renders.x = renderX(c, ov.x, brand);
    info(`✓ X render complete (${renders.x.length} chars)`);
    if (renders.x.length === 280) info("  ↳ Truncated to 280-char limit");
  } catch (e) {
    warn(`X render failed: ${String(e)}`);
  }

  // Instagram
  try {
    renders.instagram = renderInstagram(c, ov.instagram, brand);
    info(`✓ Instagram render complete (${renders.instagram.length} chars)`);
  } catch (e) {
    warn(`Instagram render failed: ${String(e)}`);
  }

  // TikTok
  try {
    renders.tiktok = renderTikTok(c, ov.tiktok, brand);
    info(`✓ TikTok render complete (${renders.tiktok.length} chars)`);
  } catch (e) {
    warn(`TikTok render failed: ${String(e)}`);
  }

  // Reddit export (stored as JSON string)
  try {
    const reddit = renderRedditExport(c, ov.reddit, brand);
    renders.reddit = JSON.stringify(reddit);
    info(`✓ Reddit export ready (r/${reddit.subreddit})`);
  } catch (e) {
    warn(`Reddit export failed: ${String(e)}`);
  }

  // Website markdown
  try {
    renders.website = renderWebsite(c, ov.website, brand, msg.title);
    info(`✓ Website markdown render complete (${renders.website.length} chars)`);
  } catch (e) {
    warn(`Website render failed: ${String(e)}`);
  }

  await saveRenders(params.id, renders);
  info("Renders saved.");

  return NextResponse.json({ renders, log });
}
