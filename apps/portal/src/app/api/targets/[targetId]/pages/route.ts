/**
 * GET /api/targets/[targetId]/pages
 *
 * Returns all pages discoverable from the given publishing target.
 * Currently supports WordPress web targets only.
 * Squarespace and other providers are stubbed for future extension.
 *
 * Credentials are resolved from environment variables using the same
 * naming convention as the publish CLI (wpElementorStaging.js):
 *   WP_{SITE_KEY}_URL, WP_{SITE_KEY}_USER, WP_{SITE_KEY}_APP_PASSWORD
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { loadRegistry, getTargetType } from "@/lib/targetRegistry";
import type { WebRegistry } from "@/lib/targetRegistry";
import { listPages } from "@/lib/cms/pageDiscovery";

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

  const webReg = reg as WebRegistry;

  // Resolve base URL from the env var named in the registry JSON
  const baseUrl = process.env[webReg.base_url_env];
  if (!baseUrl) {
    return NextResponse.json(
      {
        ok: false,
        error: `Environment variable "${webReg.base_url_env}" is not set for target "${targetId}"`,
      },
      { status: 500 }
    );
  }

  // Resolve credentials using the same prefix pattern as wpElementorStaging.js:
  //   WP_{SITE_KEY_UPPERCASED_UNDERSCORED}_USER
  //   WP_{SITE_KEY_UPPERCASED_UNDERSCORED}_APP_PASSWORD
  const prefix = `WP_${targetId.toUpperCase().replace(/-/g, "_")}`;
  const username = process.env[`${prefix}_USER`] || undefined;
  const appPassword = process.env[`${prefix}_APP_PASSWORD`] || undefined;

  try {
    const pages = await listPages({
      provider: "wordpress",
      baseUrl: baseUrl.replace(/\/$/, ""),
      username,
      appPassword,
    });

    return NextResponse.json({ ok: true, pages });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
