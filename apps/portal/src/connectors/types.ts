import type { ChannelConnection } from "@prisma/client";
import type { UCSBrandMode } from "@/lib/ucs/schema";

export type SupportedPlatform = "x" | "linkedin" | "instagram" | "tiktok";

// ── OAuth ─────────────────────────────────────────────────────────────────────

export interface OAuthStartResult {
  authUrl: string;
  /** Opaque verifier to store in a cookie (PKCE or nonce). */
  codeVerifier?: string;
}

export interface OAuthCallbackResult {
  externalAccountId: string;
  displayName: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scopes: string[];
}

// ── Publishing ────────────────────────────────────────────────────────────────

export interface PublishTextResult {
  success: true;
  postId: string;
  postUrl?: string;
}

export interface PublishFailResult {
  success: false;
  error: string;
}

/** Returned when a platform capability requires manual setup/audit. Never retried. */
export interface NotSupportedResult {
  code: "NOT_SUPPORTED_YET";
  reason: string;
  next_steps: string;
}

export type PublishResult = PublishTextResult | PublishFailResult | NotSupportedResult;

export interface ScheduleResult {
  supported: false;
}

/** Resolved media asset passed to publishMedia / publishVideo. */
export interface MediaAsset {
  /** Original ref string from UCS canonical (may be URL or file path). */
  ref: string;
  type: "image" | "video";
  /** Publicly accessible URL. null if the asset is file-based and not yet uploaded. */
  url: string | null;
}

// ── Connection health ─────────────────────────────────────────────────────────

export interface TestResult {
  ok: boolean;
  displayName?: string;
  error?: string;
}

// ── Connector interface ───────────────────────────────────────────────────────

export interface PublishConnector {
  readonly platform: SupportedPlatform;

  /**
   * Generates the OAuth redirect URL and a PKCE verifier (if applicable).
   * @param brandMode - stored in state param so callback knows which brand.
   * @param nonce     - anti-CSRF nonce (caller stores in httpOnly cookie).
   */
  getAuthUrl(brandMode: UCSBrandMode, nonce: string): OAuthStartResult;

  /**
   * Exchanges the OAuth code for tokens.
   * @param code         - authorization code from platform callback.
   * @param codeVerifier - PKCE verifier from cookie (pass "" if not applicable).
   * @param brand        - brand slug for brand-specific credential lookup.
   */
  handleCallback(code: string, codeVerifier: string, brand?: string): Promise<OAuthCallbackResult>;

  /**
   * Refreshes access token if it is expired or will expire within 5 min.
   * Returns the original connection if refresh is not needed / not supported.
   */
  refreshTokenIfNeeded(connection: ChannelConnection): Promise<ChannelConnection>;

  /** Verifies the stored token is still valid. */
  testConnection(connection: ChannelConnection): Promise<TestResult>;

  /**
   * Publishes plain text to the platform.
   * May return NotSupportedResult for platforms that require media (e.g. Instagram).
   */
  publishText(connection: ChannelConnection, text: string): Promise<PublishResult>;

  /**
   * Publishes text + media (image or video).
   * Optional — return { supported: false } if not implemented.
   */
  publishMedia?(
    connection: ChannelConnection,
    text: string,
    media: MediaAsset
  ): Promise<PublishResult | { supported: false }>;

  /** Schedules a post (return { supported: false } if not supported natively). */
  schedulePost?(
    connection: ChannelConnection,
    text: string,
    scheduledFor: Date
  ): Promise<PublishResult | ScheduleResult>;
}
