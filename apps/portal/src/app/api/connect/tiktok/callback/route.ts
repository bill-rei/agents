import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { tiktokConnector } from "@/connectors/tiktok";
import { encrypt } from "@/lib/crypto/tokenVault";
import { db } from "@/lib/db";
import { decodeState, NONCE_COOKIE, PKCE_COOKIE } from "@/lib/oauthState";

const SETTINGS_URL = "/settings/channels";

export async function GET(req: NextRequest) {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.redirect(new URL(`${SETTINGS_URL}?error=unauthorized`, req.url));
  }

  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const stateParam = searchParams.get("state");
  const errorParam = searchParams.get("error");

  if (errorParam) {
    return NextResponse.redirect(
      new URL(`${SETTINGS_URL}?error=${encodeURIComponent(errorParam)}`, req.url)
    );
  }
  if (!code || !stateParam) {
    return NextResponse.redirect(new URL(`${SETTINGS_URL}?error=missing_params`, req.url));
  }

  const state = decodeState(stateParam);
  const cookieNonce = req.cookies.get(NONCE_COOKIE)?.value;
  const codeVerifier = req.cookies.get(PKCE_COOKIE)?.value ?? "";

  if (!state || !cookieNonce || state.nonce !== cookieNonce) {
    return NextResponse.redirect(new URL(`${SETTINGS_URL}?error=invalid_state`, req.url));
  }

  try {
    const tokens = await tiktokConnector.handleCallback(code, codeVerifier);

    await db.channelConnection.upsert({
      where: { brandMode_platform: { brandMode: state.brandMode as any, platform: "tiktok" } },
      create: {
        brandMode: state.brandMode as any,
        platform: "tiktok",
        externalAccountId: tokens.externalAccountId,
        displayName: tokens.displayName,
        accessTokenCiphertext: encrypt(tokens.accessToken),
        refreshTokenCiphertext: tokens.refreshToken ? encrypt(tokens.refreshToken) : null,
        expiresAt: tokens.expiresAt ?? null,
        scopesJson: tokens.scopes,
        connectedByUserId: user.id,
      },
      update: {
        externalAccountId: tokens.externalAccountId,
        displayName: tokens.displayName,
        accessTokenCiphertext: encrypt(tokens.accessToken),
        refreshTokenCiphertext: tokens.refreshToken ? encrypt(tokens.refreshToken) : null,
        expiresAt: tokens.expiresAt ?? null,
        scopesJson: tokens.scopes,
        connectedByUserId: user.id,
      },
    });
  } catch (e) {
    console.error("[TikTok callback] error:", e instanceof Error ? e.message : String(e));
    return NextResponse.redirect(new URL(`${SETTINGS_URL}?error=callback_failed`, req.url));
  }

  const res = NextResponse.redirect(
    new URL(`${SETTINGS_URL}?connected=tiktok&brand=${state.brandMode}`, req.url)
  );
  res.cookies.delete(NONCE_COOKIE);
  res.cookies.delete(PKCE_COOKIE);
  return res;
}
