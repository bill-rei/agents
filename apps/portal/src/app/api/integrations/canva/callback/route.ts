/**
 * GET /api/integrations/canva/callback
 *
 * OAuth 2.0 callback from Canva. Admin-only.
 * Validates state, exchanges the code for tokens, and persists the integration.
 * Redirects to the portal settings page on success (or error page on failure).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { requireRole } from "@/lib/authorization";
import { db } from "@/lib/db";
import {
  exchangeCodeForTokens,
  tokenExpiresAt,
} from "@/lib/canva/canvaClient";

const SUCCESS_REDIRECT = "/workspaces?canva=connected";
const ERROR_REDIRECT = "/workspaces?canva=error";

export async function GET(req: NextRequest) {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.redirect(new URL(ERROR_REDIRECT, req.nextUrl.origin));
  }

  try {
    requireRole(user.role, ["admin"]);
  } catch {
    return NextResponse.redirect(new URL(ERROR_REDIRECT, req.nextUrl.origin));
  }

  // Read and clear PKCE cookie
  const pkceCookie = req.cookies.get("canva_pkce")?.value;
  if (!pkceCookie) {
    return NextResponse.redirect(
      new URL(`${ERROR_REDIRECT}&reason=missing_pkce`, req.nextUrl.origin)
    );
  }

  let state: string;
  let codeVerifier: string;
  try {
    const payload = JSON.parse(Buffer.from(pkceCookie, "base64").toString());
    state = payload.state;
    codeVerifier = payload.codeVerifier;
  } catch {
    return NextResponse.redirect(
      new URL(`${ERROR_REDIRECT}&reason=invalid_pkce`, req.nextUrl.origin)
    );
  }

  // Validate URL parameters
  const searchParams = req.nextUrl.searchParams;
  const returnedState = searchParams.get("state");
  const code = searchParams.get("code");
  const errorParam = searchParams.get("error");

  if (errorParam) {
    return NextResponse.redirect(
      new URL(`${ERROR_REDIRECT}&reason=${encodeURIComponent(errorParam)}`, req.nextUrl.origin)
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL(`${ERROR_REDIRECT}&reason=no_code`, req.nextUrl.origin)
    );
  }

  if (returnedState !== state) {
    return NextResponse.redirect(
      new URL(`${ERROR_REDIRECT}&reason=state_mismatch`, req.nextUrl.origin)
    );
  }

  const redirectUri = process.env.CANVA_REDIRECT_URL;
  if (!redirectUri) {
    return NextResponse.redirect(
      new URL(`${ERROR_REDIRECT}&reason=no_redirect_uri`, req.nextUrl.origin)
    );
  }

  // Exchange code for tokens
  let tokens;
  try {
    tokens = await exchangeCodeForTokens(code, codeVerifier, redirectUri);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "token_exchange_failed";
    // Log the error type but never the token value
    console.error("[Canva OAuth] Token exchange error:", msg.slice(0, 200));
    return NextResponse.redirect(
      new URL(`${ERROR_REDIRECT}&reason=token_exchange`, req.nextUrl.origin)
    );
  }

  // Persist integration (upsert — one Canva integration per portal)
  await db.integration.upsert({
    where: { provider: "canva" },
    update: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      expiresAt: tokenExpiresAt(tokens.expires_in),
      connectedByUserId: user.id,
      scopes: tokens.scope.split(" "),
      meta: {},
      updatedAt: new Date(),
    },
    create: {
      provider: "canva",
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      expiresAt: tokenExpiresAt(tokens.expires_in),
      connectedByUserId: user.id,
      scopes: tokens.scope.split(" "),
      meta: {},
    },
  });

  // Clear PKCE cookie
  const response = NextResponse.redirect(new URL(SUCCESS_REDIRECT, req.nextUrl.origin));
  response.cookies.set("canva_pkce", "", { maxAge: 0, path: "/" });
  return response;
}
