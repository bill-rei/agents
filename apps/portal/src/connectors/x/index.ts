/**
 * X (Twitter) connector — OAuth 2.0 with PKCE
 *
 * Required env vars:
 *   X_CLIENT_ID
 *   X_CLIENT_SECRET
 *   X_REDIRECT_URI  (e.g. https://app.example.com/api/connect/x/callback)
 */

import { createHash, randomBytes } from "crypto";
import { decrypt, encrypt } from "@/lib/crypto/tokenVault";
import { db } from "@/lib/db";
import type { ChannelConnection } from "@prisma/client";
import type {
  OAuthCallbackResult,
  OAuthStartResult,
  PublishConnector,
  PublishResult,
  TestResult,
} from "../types";
import type { UCSBrandMode } from "@/lib/ucs/schema";

const TOKEN_URL = "https://api.twitter.com/2/oauth2/token";
const AUTH_BASE = "https://twitter.com/i/oauth2/authorize";
const USER_URL = "https://api.twitter.com/2/users/me";
const TWEETS_URL = "https://api.twitter.com/2/tweets";
const SCOPES = "tweet.write tweet.read users.read offline.access";

// Env var resolution order (brand = any registered brandKey, e.g. "mycoachbill"):
//   1. <BRANDKEY_UPPER>_X_CLIENT_ID  (brand-specific, e.g. MYCOACHBILL_X_CLIENT_ID)
//   2. X_CLIENT_ID                   (shared fallback)
function clientId(brand?: string): string {
  const branded = brand ? process.env[`${brand.toUpperCase()}_X_CLIENT_ID`] : undefined;
  const v = branded ?? process.env.X_CLIENT_ID;
  if (!v) throw new Error(`X client ID not configured for brand ${brand ?? "default"}`);
  return v;
}
function clientSecret(brand?: string): string {
  const branded = brand ? process.env[`${brand.toUpperCase()}_X_CLIENT_SECRET`] : undefined;
  const v = branded ?? process.env.X_CLIENT_SECRET;
  if (!v) throw new Error(`X client secret not configured for brand ${brand ?? "default"}`);
  return v;
}
function redirectUri(brand?: string): string {
  const branded = brand ? process.env[`${brand.toUpperCase()}_X_REDIRECT_URI`] : undefined;
  const v = branded ?? process.env.X_REDIRECT_URI;
  if (!v) throw new Error(`X redirect URI not configured for brand ${brand ?? "default"}`);
  return v;
}

/** base64url without padding */
function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function buildCodeChallenge(verifier: string): string {
  return b64url(createHash("sha256").update(verifier).digest());
}

export const xConnector: PublishConnector = {
  platform: "x",

  getAuthUrl(brandMode: UCSBrandMode, nonce: string): OAuthStartResult {
    // 43-char URL-safe code_verifier
    const codeVerifier = b64url(randomBytes(32));
    const codeChallenge = buildCodeChallenge(codeVerifier);

    const state = b64url(Buffer.from(JSON.stringify({ brandMode, nonce })));
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId(brandMode),
      redirect_uri: redirectUri(brandMode),
      scope: SCOPES,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });

    return { authUrl: `${AUTH_BASE}?${params}`, codeVerifier };
  },

  async handleCallback(code: string, codeVerifier: string, brand?: string): Promise<OAuthCallbackResult> {
    // Basic auth = base64(clientId:clientSecret)
    const basic = Buffer.from(`${clientId(brand)}:${clientSecret(brand)}`).toString("base64");

    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basic}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri(brand),
        code_verifier: codeVerifier,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`X token exchange failed: ${err}`);
    }

    const tokens = await res.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
    };

    // Get user info
    const userRes = await fetch(`${USER_URL}?user.fields=name,username`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const userData = await userRes.json() as { data?: { id: string; name: string; username: string } };
    const user = userData.data;
    if (!user) throw new Error("Failed to fetch X user info");

    return {
      externalAccountId: user.id,
      displayName: `@${user.username}`,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000)
        : undefined,
      scopes: tokens.scope ? tokens.scope.split(" ") : SCOPES.split(" "),
    };
  },

  async refreshTokenIfNeeded(connection: ChannelConnection): Promise<ChannelConnection> {
    if (!connection.refreshTokenCiphertext) return connection;

    // Refresh if expired or within 5 min of expiry
    const needsRefresh =
      !connection.expiresAt ||
      connection.expiresAt.getTime() < Date.now() + 5 * 60 * 1000;

    if (!needsRefresh) return connection;

    const refreshToken = decrypt(connection.refreshTokenCiphertext);
    const brand = connection.brandMode ?? undefined;
    const basic = Buffer.from(`${clientId(brand)}:${clientSecret(brand)}`).toString("base64");

    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basic}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });

    if (!res.ok) throw new Error("X token refresh failed");

    const tokens = await res.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };

    const updated = await db.channelConnection.update({
      where: { id: connection.id },
      data: {
        accessTokenCiphertext: encrypt(tokens.access_token),
        refreshTokenCiphertext: tokens.refresh_token
          ? encrypt(tokens.refresh_token)
          : connection.refreshTokenCiphertext,
        expiresAt: tokens.expires_in
          ? new Date(Date.now() + tokens.expires_in * 1000)
          : connection.expiresAt,
      },
    });

    return updated;
  },

  async testConnection(connection: ChannelConnection): Promise<TestResult> {
    try {
      const token = decrypt(connection.accessTokenCiphertext);
      const res = await fetch(`${USER_URL}?user.fields=username`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      const data = await res.json() as { data?: { username: string } };
      return { ok: true, displayName: data.data ? `@${data.data.username}` : connection.displayName };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },

  async publishText(connection: ChannelConnection, text: string): Promise<PublishResult> {
    try {
      const conn = await this.refreshTokenIfNeeded(connection);
      const token = decrypt(conn.accessTokenCiphertext);

      const res = await fetch(TWEETS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text }),
      });

      if (!res.ok) {
        const err = await res.text();
        return { success: false, error: `X API error ${res.status}: ${err}` };
      }

      const data = await res.json() as { data?: { id: string } };
      const postId = data.data?.id ?? "unknown";
      return {
        success: true,
        postId,
        postUrl: `https://x.com/i/web/status/${postId}`,
      };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  },
};
