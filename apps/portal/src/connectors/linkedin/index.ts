/**
 * LinkedIn connector — OAuth 2.0 (authorization code flow)
 *
 * Required env vars:
 *   LINKEDIN_CLIENT_ID
 *   LINKEDIN_CLIENT_SECRET
 *   LINKEDIN_REDIRECT_URI  (e.g. https://app.example.com/api/connect/linkedin/callback)
 *
 * Publishes as the authenticated member (personal account).
 * Access tokens last 60 days. LinkedIn does not issue refresh tokens in the
 * standard flow — users reconnect when the token expires.
 */

import { randomBytes } from "crypto";
import { decrypt } from "@/lib/crypto/tokenVault";
import type { ChannelConnection } from "@prisma/client";
import type {
  OAuthCallbackResult,
  OAuthStartResult,
  PublishConnector,
  PublishResult,
  ScheduleResult,
  TestResult,
} from "../types";
import type { UCSBrandMode } from "@/lib/ucs/schema";

const AUTH_BASE = "https://www.linkedin.com/oauth/v2/authorization";
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const USERINFO_URL = "https://api.linkedin.com/v2/userinfo";
const POSTS_URL = "https://api.linkedin.com/v2/ugcPosts";
// w_member_social requires "Share on LinkedIn" product approval in LinkedIn Developer Portal.
// Add it to your app: developers.linkedin.com → your app → Products → "Share on LinkedIn"
// Required LinkedIn Developer Portal products:
//   "Sign In with LinkedIn using OpenID Connect" → openid profile email
//   "Share on LinkedIn"                          → w_member_social w_organization_social
const SCOPES = process.env.LINKEDIN_SCOPES ?? "openid profile email w_member_social w_organization_social";

function clientId(): string {
  const v = process.env.LINKEDIN_CLIENT_ID;
  if (!v) throw new Error("LINKEDIN_CLIENT_ID not configured");
  return v;
}
function clientSecret(): string {
  const v = process.env.LINKEDIN_CLIENT_SECRET;
  if (!v) throw new Error("LINKEDIN_CLIENT_SECRET not configured");
  return v;
}
function redirectUri(): string {
  const v = process.env.LINKEDIN_REDIRECT_URI;
  if (!v) throw new Error("LINKEDIN_REDIRECT_URI not configured");
  return v;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export const linkedinConnector: PublishConnector = {
  platform: "linkedin",

  getAuthUrl(brandMode: UCSBrandMode, nonce: string): OAuthStartResult {
    const state = b64url(Buffer.from(JSON.stringify({ brandMode, nonce })));
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId(),
      redirect_uri: redirectUri(),
      scope: SCOPES,
      state,
    });
    return { authUrl: `${AUTH_BASE}?${params}` };
  },

  async handleCallback(code: string, _codeVerifier: string): Promise<OAuthCallbackResult> {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri(),
        client_id: clientId(),
        client_secret: clientSecret(),
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`LinkedIn token exchange failed: ${err}`);
    }

    const tokens = await res.json() as {
      access_token: string;
      expires_in?: number;
      scope?: string;
    };

    // OpenID Connect userinfo
    const userRes = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const user = await userRes.json() as {
      sub: string;   // "urn:li:person:{id}" or just the id
      name?: string;
      email?: string;
    };

    if (!user.sub) throw new Error("Failed to fetch LinkedIn user info");

    return {
      externalAccountId: user.sub,
      displayName: user.name ?? user.email ?? user.sub,
      accessToken: tokens.access_token,
      expiresAt: tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000)
        : new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // LinkedIn default: 60 days
      scopes: tokens.scope ? tokens.scope.split(" ") : SCOPES.split(" "),
    };
  },

  // LinkedIn does not issue refresh tokens — return as-is
  async refreshTokenIfNeeded(connection: ChannelConnection): Promise<ChannelConnection> {
    return connection;
  },

  async testConnection(connection: ChannelConnection): Promise<TestResult> {
    try {
      const token = decrypt(connection.accessTokenCiphertext);
      const res = await fetch(USERINFO_URL, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      const data = await res.json() as { name?: string };
      return { ok: true, displayName: data.name ?? connection.displayName };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },

  async publishText(connection: ChannelConnection, text: string): Promise<PublishResult> {
    try {
      const token = decrypt(connection.accessTokenCiphertext);

      // Resolve author URN: prefer org page for the brand, fall back to personal account.
      // Set LLIF_LINKEDIN_ORG_ID or BESTLIFE_LINKEDIN_ORG_ID in env to post as a company page.
      const orgIdEnvKey = `${connection.brandMode.toUpperCase()}_LINKEDIN_ORG_ID`;
      const orgId = process.env[orgIdEnvKey];

      let authorUrn: string;
      let visibility: object;

      if (orgId) {
        authorUrn = `urn:li:organization:${orgId}`;
        visibility = { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" };
      } else {
        const personId = connection.externalAccountId.startsWith("urn:")
          ? connection.externalAccountId
          : `urn:li:person:${connection.externalAccountId}`;
        authorUrn = personId;
        visibility = { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" };
      }

      const body = {
        author: authorUrn,
        lifecycleState: "PUBLISHED",
        specificContent: {
          "com.linkedin.ugc.ShareContent": {
            shareCommentary: { text },
            shareMediaCategory: "NONE",
          },
        },
        visibility,
      };

      const res = await fetch(POSTS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-Restli-Protocol-Version": "2.0.0",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.text();
        return { success: false, error: `LinkedIn API error ${res.status}: ${err}` };
      }

      // LinkedIn returns the post URN in the X-RestLi-Id header
      const postUrn = res.headers.get("x-restli-id") ?? res.headers.get("X-RestLi-Id") ?? "";
      const postId = postUrn.split(":").pop() ?? postUrn;

      return {
        success: true,
        postId,
        postUrl: `https://www.linkedin.com/feed/update/${postUrn}`,
      };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  },

  schedulePost(): Promise<ScheduleResult> {
    // LinkedIn API does not support native scheduling
    return Promise.resolve({ supported: false });
  },
};
