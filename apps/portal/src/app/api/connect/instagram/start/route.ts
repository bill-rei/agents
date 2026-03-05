import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { instagramConnector } from "@/connectors/instagram";
import {
  generateNonce,
  encodeState,
  NONCE_COOKIE,
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
  const { authUrl } = instagramConnector.getAuthUrl(brand, nonce);

  const res = NextResponse.redirect(authUrl);
  res.cookies.set(NONCE_COOKIE, nonce, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });
  return res;
}
