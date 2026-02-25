/**
 * GET /api/targets/[targetId]/pages
 *
 * Returns all pages discoverable from the given publishing target.
 * Currently supports WordPress web targets only.
 * Squarespace and other providers are stubbed for future extension.
 *
 * Credentials are resolved via getWpCredentials(brand) which reads
 * the portal's env vars: LLIF_WP_BASE_URL / LLIF_WP_USERNAME / LLIF_WP_APP_PASSWORD
 * (or BLA_WP_* equivalents for BestLife). No credentials in the root agents/.env are needed.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { loadRegistry, getTargetType, deriveBrandFromTarget } from "@/lib/targetRegistry";
import { listPages } from "@/lib/cms/pageDiscovery";
import { getWpCredentials } from "@/lib/wp/wpClient";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ targetId: string }> }
) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { targetId } = await params;

  // Guard: only allow targets defined in our registry (no arbitrary URLs)
  let reg: ReturnType<typeof loadRegistry>;
  try {
    reg = loadRegistry(targetId);
  } catch {
    return NextResponse.json(
      { ok: false, error: `Unknown target: "${targetId}"` },
      { status: 404 }
    );
  }

  if (getTargetType(reg) !== "web") {
    return NextResponse.json(
      { ok: false, error: `Target "${targetId}" is not a web target` },
      { status: 400 }
    );
  }

  // Resolve credentials via the portal's brand-based env var convention:
  //   LLIF_WP_BASE_URL / LLIF_WP_USERNAME / LLIF_WP_APP_PASSWORD
  //   BLA_WP_BASE_URL  / BLA_WP_USERNAME  / BLA_WP_APP_PASSWORD
  const brand = deriveBrandFromTarget(reg);
  let creds: { baseUrl: string; username: string; appPassword: string };
  try {
    creds = getWpCredentials(brand as "llif" | "bestlife");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }

  try {
    const pages = await listPages({
      provider: "wordpress",
      baseUrl: creds.baseUrl,
      username: creds.username,
      appPassword: creds.appPassword,
    });

    return NextResponse.json({ ok: true, pages });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
