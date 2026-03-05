/**
 * Instagram connector — Facebook/Meta Graph API
 *
 * Required env vars (brand-specific prefix OR generic fallback):
 *   INSTAGRAM_CLIENT_ID       / LLIF_INSTAGRAM_CLIENT_ID / BESTLIFE_INSTAGRAM_CLIENT_ID
 *   INSTAGRAM_CLIENT_SECRET   / LLIF_INSTAGRAM_CLIENT_SECRET / BESTLIFE_INSTAGRAM_CLIENT_SECRET
 *   INSTAGRAM_REDIRECT_URI    / LLIF_INSTAGRAM_REDIRECT_URI / BESTLIFE_INSTAGRAM_REDIRECT_URI
 *
 * Requirements:
 *   - Facebook App with "Instagram Graph API" product added
 *   - Connected Instagram Business or Creator account (linked to a Facebook Page)
 *   - Approved permissions: instagram_basic, instagram_content_publish,
 *     pages_show_list, pages_read_engagement
 */

import { randomBytes } from "crypto";
import { decrypt, encrypt } from "@/lib/crypto/tokenVault";
import { db } from "@/lib/db";
import type { ChannelConnection } from "@prisma/client";
import type {
  OAuthCallbackResult,
  OAuthStartResult,
  PublishConnector,
  PublishResult,
  TestResult,
  MediaAsset,
  NotSupportedResult,
} from "../types";
import type { UCSBrandMode } from "@/lib/ucs/schema";

const GRAPH = "https://graph.facebook.com/v19.0";
const AUTH_BASE = "https://www.facebook.com/v19.0/dialog/oauth";
const TOKEN_URL = `${GRAPH}/oauth/access_token`;

const SCOPES = [
  "instagram_basic",
  "instagram_content_publish",
  "pages_show_list",
  "pages_read_engagement",
].join(",");

// ── Credential resolution ─────────────────────────────────────────────────────

function clientId(brand?: string): string {
  const v =
    (brand ? process.env[`${brand.toUpperCase()}_INSTAGRAM_CLIENT_ID`] : undefined) ??
    process.env.INSTAGRAM_CLIENT_ID;
  if (!v) throw new Error(`Instagram client ID not configured for brand ${brand ?? "default"}`);
  return v;
}
function clientSecret(brand?: string): string {
  const v =
    (brand ? process.env[`${brand.toUpperCase()}_INSTAGRAM_CLIENT_SECRET`] : undefined) ??
    process.env.INSTAGRAM_CLIENT_SECRET;
  if (!v) throw new Error(`Instagram client secret not configured for brand ${brand ?? "default"}`);
  return v;
}
function redirectUri(brand?: string): string {
  const v =
    (brand ? process.env[`${brand.toUpperCase()}_INSTAGRAM_REDIRECT_URI`] : undefined) ??
    process.env.INSTAGRAM_REDIRECT_URI;
  if (!v) throw new Error(`Instagram redirect URI not configured for brand ${brand ?? "default"}`);
  return v;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function exchangeForLongLivedToken(shortToken: string, brand?: string): Promise<{
  access_token: string;
  expires_in: number;
}> {
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: clientId(brand),
    client_secret: clientSecret(brand),
    fb_exchange_token: shortToken,
  });
  const res = await fetch(`${TOKEN_URL}?${params}`);
  if (!res.ok) throw new Error(`Instagram long-lived token exchange failed: ${await res.text()}`);
  return res.json();
}

/** Find the first Instagram Business Account linked to any Facebook Page of the user. */
async function findIgAccount(userToken: string): Promise<{ igUserId: string; igUsername: string } | null> {
  // 1. Get pages the user manages
  const pagesRes = await fetch(`${GRAPH}/me/accounts?access_token=${userToken}`);
  if (!pagesRes.ok) return null;
  const pagesData = await pagesRes.json() as { data?: { id: string; access_token: string }[] };
  const pages = pagesData.data ?? [];

  // 2. For each page, get the linked Instagram Business Account
  for (const page of pages) {
    const igRes = await fetch(
      `${GRAPH}/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`
    );
    if (!igRes.ok) continue;
    const igData = await igRes.json() as { instagram_business_account?: { id: string } };
    const igId = igData.instagram_business_account?.id;
    if (!igId) continue;

    // 3. Get the IG username
    const userRes = await fetch(
      `${GRAPH}/${igId}?fields=username,name&access_token=${userToken}`
    );
    if (!userRes.ok) continue;
    const userData = await userRes.json() as { username?: string; name?: string };
    return { igUserId: igId, igUsername: userData.username ?? userData.name ?? igId };
  }
  return null;
}

// ── Connector ─────────────────────────────────────────────────────────────────

export const instagramConnector: PublishConnector = {
  platform: "instagram",

  getAuthUrl(brandMode: UCSBrandMode, nonce: string): OAuthStartResult {
    const state = b64url(Buffer.from(JSON.stringify({ brandMode, nonce })));
    const params = new URLSearchParams({
      client_id: clientId(brandMode),
      redirect_uri: redirectUri(brandMode),
      scope: SCOPES,
      response_type: "code",
      state,
    });
    return { authUrl: `${AUTH_BASE}?${params}` };
  },

  async handleCallback(code: string, _codeVerifier: string, brand?: string): Promise<OAuthCallbackResult> {
    // 1. Exchange code for short-lived user token
    const params = new URLSearchParams({
      client_id: clientId(brand),
      client_secret: clientSecret(brand),
      redirect_uri: redirectUri(brand),
      code,
    });
    const tokenRes = await fetch(`${TOKEN_URL}?${params}`);
    if (!tokenRes.ok) throw new Error(`Instagram token exchange failed: ${await tokenRes.text()}`);
    const shortToken = await tokenRes.json() as { access_token: string };

    // 2. Exchange for long-lived token (60-day lifetime)
    const longToken = await exchangeForLongLivedToken(shortToken.access_token, brand);

    // 3. Find IG Business Account
    const igAccount = await findIgAccount(longToken.access_token);
    if (!igAccount) {
      throw new Error(
        "No Instagram Business Account found. Make sure your Facebook Page has an Instagram Business or Creator account linked."
      );
    }

    return {
      externalAccountId: igAccount.igUserId,
      displayName: `@${igAccount.igUsername}`,
      accessToken: longToken.access_token,
      expiresAt: new Date(Date.now() + longToken.expires_in * 1000),
      scopes: SCOPES.split(","),
    };
  },

  async refreshTokenIfNeeded(connection: ChannelConnection): Promise<ChannelConnection> {
    // Refresh if token expires within 7 days (Facebook long-lived tokens: 60 days)
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    const needsRefresh =
      !connection.expiresAt ||
      connection.expiresAt.getTime() < Date.now() + sevenDays;

    if (!needsRefresh) return connection;

    const currentToken = decrypt(connection.accessTokenCiphertext);
    const params = new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: clientId(connection.brandMode),
      client_secret: clientSecret(connection.brandMode),
      fb_exchange_token: currentToken,
    });

    const res = await fetch(`${TOKEN_URL}?${params}`);
    if (!res.ok) {
      // Don't throw — return the existing connection and let it fail at publish time
      console.warn("[Instagram] Token refresh failed:", await res.text());
      return connection;
    }

    const tokens = await res.json() as { access_token: string; expires_in: number };

    return db.channelConnection.update({
      where: { id: connection.id },
      data: {
        accessTokenCiphertext: encrypt(tokens.access_token),
        expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
      },
    });
  },

  async testConnection(connection: ChannelConnection): Promise<TestResult> {
    try {
      const token = decrypt(connection.accessTokenCiphertext);
      const igUserId = connection.externalAccountId;
      const res = await fetch(`${GRAPH}/${igUserId}?fields=username,name&access_token=${token}`);
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      const data = await res.json() as { username?: string; name?: string };
      const name = data.username ? `@${data.username}` : data.name ?? connection.displayName;
      return { ok: true, displayName: name };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  },

  async publishText(_connection: ChannelConnection, _text: string): Promise<PublishResult> {
    const result: NotSupportedResult = {
      code: "NOT_SUPPORTED_YET",
      reason: "Instagram does not support text-only posts via the Graph API. An image or video is required.",
      next_steps: "Add a media URL to the UCS canonical mediaRefs and use publishMedia instead.",
    };
    return result;
  },

  async publishMedia(
    connection: ChannelConnection,
    text: string,
    media: MediaAsset
  ): Promise<PublishResult | { supported: false }> {
    if (!media.url) {
      const result: NotSupportedResult = {
        code: "NOT_SUPPORTED_YET",
        reason: "File-based media assets must be uploaded to a publicly accessible URL before publishing to Instagram.",
        next_steps: "Use a URL-based media ref (https://...) in the UCS canonical mediaRefs.",
      };
      return result;
    }

    try {
      const token = decrypt(connection.accessTokenCiphertext);
      const igUserId = connection.externalAccountId;

      // 1. Create media container
      const containerParams = new URLSearchParams({
        caption: text,
        access_token: token,
      });

      if (media.type === "video") {
        containerParams.set("media_type", "REELS");
        containerParams.set("video_url", media.url);
      } else {
        containerParams.set("image_url", media.url);
      }

      const containerRes = await fetch(`${GRAPH}/${igUserId}/media`, {
        method: "POST",
        body: containerParams,
      });

      if (!containerRes.ok) {
        const err = await containerRes.text();
        return { success: false, error: `Instagram container creation failed: ${err}` };
      }

      const { id: creationId } = await containerRes.json() as { id: string };

      // 2. For video, poll until container is ready (up to 30s)
      if (media.type === "video") {
        for (let i = 0; i < 10; i++) {
          await new Promise((r) => setTimeout(r, 3000));
          const statusRes = await fetch(
            `${GRAPH}/${creationId}?fields=status_code&access_token=${token}`
          );
          const statusData = await statusRes.json() as { status_code?: string };
          if (statusData.status_code === "FINISHED") break;
          if (statusData.status_code === "ERROR") {
            return { success: false, error: "Instagram video processing failed." };
          }
        }
      }

      // 3. Publish the container
      const publishRes = await fetch(`${GRAPH}/${igUserId}/media_publish`, {
        method: "POST",
        body: new URLSearchParams({ creation_id: creationId, access_token: token }),
      });

      if (!publishRes.ok) {
        const err = await publishRes.text();
        return { success: false, error: `Instagram publish failed: ${err}` };
      }

      const { id: postId } = await publishRes.json() as { id: string };
      return {
        success: true,
        postId,
        postUrl: `https://www.instagram.com/p/${postId}/`,
      };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  },

  schedulePost(): Promise<{ supported: false }> {
    return Promise.resolve({ supported: false });
  },
};
