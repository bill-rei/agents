/**
 * GET /api/integrations/canva/connect
 *
 * Initiates the Canva OAuth 2.0 PKCE flow. Admin-only.
 * Sets an HttpOnly cookie with the PKCE state+verifier, then redirects to Canva.
 */
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { requireRole } from "@/lib/authorization";
import {
  buildAuthorizationUrl,
} from "@/lib/canva/canvaClient";

export async function GET() {
  let user;
  try {
    user = await requireAuth();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    requireRole(user.role, ["admin"]);
  } catch {
    return NextResponse.json({ error: "Forbidden — admin only" }, { status: 403 });
  }

  const redirectUri = process.env.CANVA_REDIRECT_URL;
  if (!redirectUri) {
    return NextResponse.json(
      { error: "CANVA_REDIRECT_URL is not configured" },
      { status: 500 }
    );
  }

  const { url, state, codeVerifier } = buildAuthorizationUrl(redirectUri);

  // Store state + verifier in a short-lived HttpOnly cookie
  const pkcePayload = JSON.stringify({ state, codeVerifier });
  const cookieValue = Buffer.from(pkcePayload).toString("base64");

  const response = NextResponse.redirect(url);
  response.cookies.set("canva_pkce", cookieValue, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600, // 10 minutes
    path: "/",
  });

  return response;
}
