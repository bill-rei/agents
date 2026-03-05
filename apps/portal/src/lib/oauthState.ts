/**
 * OAuth state helpers — encode/decode the state parameter,
 * generate nonces for anti-CSRF protection.
 */

import { randomBytes } from "crypto";
import type { UCSBrandMode } from "@/lib/ucs/schema";

export interface OAuthState {
  brandMode: UCSBrandMode;
  nonce: string;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

export function generateNonce(): string {
  return randomBytes(16).toString("hex");
}

export function encodeState(state: OAuthState): string {
  return b64url(Buffer.from(JSON.stringify(state)));
}

export function decodeState(encoded: string): OAuthState | null {
  try {
    const padded = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(padded, "base64").toString("utf8");
    const parsed = JSON.parse(json);
    if (!parsed.brandMode || !parsed.nonce) return null;
    return parsed as OAuthState;
  } catch {
    return null;
  }
}

export const NONCE_COOKIE = "oauth_nonce";
export const PKCE_COOKIE = "oauth_pkce_verifier";
export const COOKIE_MAX_AGE = 600; // 10 minutes
