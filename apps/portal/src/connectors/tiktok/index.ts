/**
 * TikTok connector — Content Posting API v2
 *
 * Required env vars:
 *   TIKTOK_CLIENT_KEY     (TikTok calls this "client_key", not client_id)
 *   TIKTOK_CLIENT_SECRET
 *   TIKTOK_REDIRECT_URI
 *
 * Publishing status:
 *   publishText  → NOT_SUPPORTED_YET  (TikTok is video-only via API)
 *   publishMedia → NOT_SUPPORTED_YET  (video.publish scope requires app audit/review)
 *   connect + testConnection → fully supported
 *
 * To enable video publishing:
 *   1. Submit your TikTok app for review at developers.tiktok.com
 *   2. Request approval for the "video.publish" scope
 *   3. Once approved, implement publishMedia using the Direct Post API
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
  NotSupportedResult,
} from "../types";
import type { UCSBrandMode } from "@/lib/ucs/schema";

const AUTH_BASE = "https://www.tiktok.com/v2/auth/authorize/";
const TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const USER_URL = "https://open.tiktokapis.com/v2/user/info/";

// video.upload needed even for the stub so the auth flow is future-proof
const SCOPES = "user.info.basic,video.upload";

// ── Credential resolution ─────────────────────────────────────────────────────

function clientKey(): string {
  const v = process.env.TIKTOK_CLIENT_KEY;
  if (!v) throw new Error("TIKTOK_CLIENT_KEY not configured");
  return v;
}
function clientSecret(): string {
  const v = process.env.TIKTOK_CLIENT_SECRET;
  if (!v) throw new Error("TIKTOK_CLIENT_SECRET not configured");
  return v;
}
function redirectUri(): string {
  const v = process.env.TIKTOK_REDIRECT_URI;
  if (!v) throw new Error("TIKTOK_REDIRECT_URI not configured");
  return v;
}

// ── PKCE helpers ──────────────────────────────────────────────────────────────

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
function buildCodeChallenge(verifier: string): string {
  return b64url(createHash("sha256").update(verifier).digest());
}

// ── Connector ─────────────────────────────────────────────────────────────────

export const tiktokConnector: PublishConnector = {
  platform: "tiktok",

  getAuthUrl(brandMode: UCSBrandMode, nonce: string): OAuthStartResult {
    const codeVerifier = b64url(randomBytes(32));
    const codeChallenge = buildCodeChallenge(codeVerifier);
    const state = b64url(Buffer.from(JSON.stringify({ brandMode, nonce })));

    const params = new URLSearchParams({
      client_key: clientKey(),
      redirect_uri: redirectUri(),
      scope: SCOPES,
      response_type: "code",
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });

    return { authUrl: `${AUTH_BASE}?${params}`, codeVerifier };
  },

  async handleCallback(code: string, codeVerifier: string): Promise<OAuthCallbackResult> {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: clientKey(),
        client_secret: clientSecret(),
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri(),
        code_verifier: codeVerifier,
      }),
    });

    if (!res.ok) throw new Error(`TikTok token exchange failed: ${await res.text()}`);

    const tokens = await res.json() as {
      data?: {
        access_token: string;
        refresh_token?: string;
        expires_in?: number;
        open_id?: string;
        scope?: string;
      };
      error?: string;
    };

    if (tokens.error || !tokens.data) {
      throw new Error(`TikTok token error: ${tokens.error ?? "no data"}`);
    }

    const { access_token, refresh_token, expires_in, open_id, scope } = tokens.data;

    // Get user info
    const userRes = await fetch(`${USER_URL}?fields=open_id,union_id,display_name,avatar_url`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    let displayName = `TikTok user`;
    if (userRes.ok) {
      const userData = await userRes.json() as { data?: { user?: { display_name?: string; open_id?: string } } };
      displayName = userData.data?.user?.display_name ?? displayName;
    }

    return {
      externalAccountId: open_id ?? "unknown",
      displayName,
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresAt: expires_in ? new Date(Date.now() + expires_in * 1000) : undefined,
      scopes: scope ? scope.split(",") : SCOPES.split(","),
    };
  },

  async refreshTokenIfNeeded(connection: ChannelConnection): Promise<ChannelConnection> {
    if (!connection.refreshTokenCiphertext) return connection;

    // TikTok access tokens expire in 24h; refresh tokens last 365 days
    const needsRefresh =
      !connection.expiresAt ||
      connection.expiresAt.getTime() < Date.now() + 60 * 60 * 1000; // 1 hour buffer

    if (!needsRefresh) return connection;

    const refreshToken = decrypt(connection.refreshTokenCiphertext);

    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: clientKey(),
        client_secret: clientSecret(),
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });

    if (!res.ok) throw new Error("TikTok token refresh failed");

    const tokens = await res.json() as {
      data?: { access_token: string; refresh_token?: string; expires_in?: number };
    };

    if (!tokens.data) throw new Error("TikTok refresh returned no data");

    return db.channelConnection.update({
      where: { id: connection.id },
      data: {
        accessTokenCiphertext: encrypt(tokens.data.access_token),
        refreshTokenCiphertext: tokens.data.refresh_token
          ? encrypt(tokens.data.refresh_token)
          : connection.refreshTokenCiphertext,
        expiresAt: tokens.data.expires_in
          ? new Date(Date.now() + tokens.data.expires_in * 1000)
          : connection.expiresAt,
      },
    });
  },

  async testConnection(connection: ChannelConnection): Promise<TestResult> {
    try {
      const token = decrypt(connection.accessTokenCiphertext);
      const res = await fetch(`${USER_URL}?fields=open_id,display_name`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      const data = await res.json() as { data?: { user?: { display_name?: string } } };
      const name = data.data?.user?.display_name ?? connection.displayName;
      return { ok: true, displayName: name };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },

  async publishText(_connection: ChannelConnection, _text: string): Promise<PublishResult> {
    const result: NotSupportedResult = {
      code: "NOT_SUPPORTED_YET",
      reason: "TikTok only supports video content via the API. Text-only posts are not available.",
      next_steps: "Attach a video to the UCS canonical mediaRefs. Video publishing also requires TikTok app audit approval for the video.publish scope.",
    };
    return result;
  },

  async publishMedia(): Promise<{ supported: false }> {
    // Video publishing via TikTok Content Posting API requires:
    //   1. App audit approval for the "video.publish" scope
    //   2. Upload flow: either file upload or pull from URL
    // Until approved, return not supported.
    return { supported: false };
  },

  schedulePost(): Promise<{ supported: false }> {
    return Promise.resolve({ supported: false });
  },
};
