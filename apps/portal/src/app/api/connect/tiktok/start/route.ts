import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { tiktokConnector } from "@/connectors/tiktok";
import {
  generateNonce,
  NONCE_COOKIE,
  PKCE_COOKIE,
  COOKIE_MAX_AGE,
} from "@/lib/oauthState";
import type { UCSBrandMode } from "@/lib/ucs/schema";
import { UCS_BRAND_MODES } from "@/lib/ucs/schema";

export async function GET(req: NextRequest) {
  try {
    await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const brand = req.nextUrl.searchParams.get("brand") as UCSBrandMode | null;
  if (!brand || !UCS_BRAND_MODES.includes(brand)) {
    return NextResponse.json({ error: "brand param required (LLIF | BestLife)" }, { status: 400 });
  }

  const nonce = generateNonce();
  const { authUrl, codeVerifier } = tiktokConnector.getAuthUrl(brand, nonce);

  const cookieOpts = { httpOnly: true, sameSite: "lax" as const, maxAge: COOKIE_MAX_AGE, path: "/" };
  const res = NextResponse.redirect(authUrl);
  res.cookies.set(NONCE_COOKIE, nonce, cookieOpts);
  if (codeVerifier) res.cookies.set(PKCE_COOKIE, codeVerifier, cookieOpts);
  return res;
}
