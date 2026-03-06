import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { xConnector } from "@/connectors/x";
import {
  generateNonce,
  encodeState,
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
    return NextResponse.json(
      { error: `brand param required. Valid values: ${UCS_BRAND_MODES.join(", ")}` },
      { status: 400 }
    );
  }

  const nonce = generateNonce();
  const { authUrl, codeVerifier } = xConnector.getAuthUrl(brand, nonce);

  const res = NextResponse.redirect(authUrl);
  const cookieOpts = { httpOnly: true, sameSite: "lax" as const, maxAge: COOKIE_MAX_AGE, path: "/" };
  res.cookies.set(NONCE_COOKIE, nonce, cookieOpts);
  if (codeVerifier) res.cookies.set(PKCE_COOKIE, codeVerifier, cookieOpts);
  return res;
}
