/**
 * lib/canva/canvaClient.ts — Canva Connect API client
 *
 * Handles:
 *  - PKCE code-verifier / challenge generation
 *  - OAuth 2.0 token exchange and refresh
 *  - Brand Template autofill (create design from template + field values)
 *  - PNG export + download
 *
 * SECURITY: access tokens are never logged. Do not add console.log calls
 * that print the token or any Authorization header value.
 */
import crypto from "crypto";
import { db } from "@/lib/db";

// ─── Constants ────────────────────────────────────────────────────────────────

const CANVA_AUTH_URL = "https://www.canva.com/api/oauth/authorize";
const CANVA_TOKEN_URL = "https://api.canva.com/rest/v1/oauth/token";
const CANVA_API_BASE = "https://api.canva.com/rest/v1";

const CANVA_SCOPES = [
  "design:content:read",
  "design:content:write",
  "design:meta:read",
  "brandtemplate:content:read",
  "brandtemplate:meta:read",
  "asset:read",
  "asset:write",
].join(" ");

// ─── PKCE helpers ─────────────────────────────────────────────────────────────

/** Generate a cryptographically random code verifier (RFC 7636). */
export function generateCodeVerifier(): string {
  return crypto.randomBytes(64).toString("base64url");
}

/** Derive the S256 code challenge from a verifier. */
export function generateCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

/** Generate a random state parameter to prevent CSRF. */
export function generateState(): string {
  return crypto.randomBytes(16).toString("hex");
}

// ─── Authorization URL ────────────────────────────────────────────────────────

export interface AuthUrlResult {
  url: string;
  state: string;
  codeVerifier: string;
}

export function buildAuthorizationUrl(redirectUri: string): AuthUrlResult {
  const clientId = process.env.CANVA_CLIENT_ID;
  if (!clientId) throw new Error("CANVA_CLIENT_ID env var is not set");

  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    scope: CANVA_SCOPES,
    state,
  });

  return { url: `${CANVA_AUTH_URL}?${params}`, state, codeVerifier };
}

// ─── Token exchange ───────────────────────────────────────────────────────────

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
}

export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  redirectUri: string
): Promise<TokenResponse> {
  const clientId = process.env.CANVA_CLIENT_ID;
  const clientSecret = process.env.CANVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("CANVA_CLIENT_ID or CANVA_CLIENT_SECRET is not set");
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });

  const res = await fetch(CANVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Canva token exchange failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<TokenResponse>;
}

export async function refreshTokens(
  refreshToken: string
): Promise<TokenResponse> {
  const clientId = process.env.CANVA_CLIENT_ID;
  const clientSecret = process.env.CANVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("CANVA_CLIENT_ID or CANVA_CLIENT_SECRET is not set");
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(CANVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Canva token refresh failed (${res.status}): ${text}`);
  }

  return res.json() as Promise<TokenResponse>;
}

// ─── Integration DB helpers ───────────────────────────────────────────────────

/** Compute token expiry with a 60-second safety buffer. */
export function tokenExpiresAt(expiresIn: number): Date {
  return new Date(Date.now() + (expiresIn - 60) * 1000);
}

/**
 * Load the Canva integration from DB, refreshing the access token if it has
 * expired. Returns null if no integration exists.
 * NEVER logs the access token.
 */
export async function getCanvaTokens(): Promise<{ accessToken: string } | null> {
  const integration = await db.integration.findUnique({
    where: { provider: "canva" },
  });

  if (!integration) return null;

  // Still valid
  if (integration.expiresAt && integration.expiresAt > new Date()) {
    return { accessToken: integration.accessToken };
  }

  // Expired — refresh
  if (!integration.refreshToken) {
    throw new Error("Canva integration has no refresh token; re-connect Canva");
  }

  const tokens = await refreshTokens(integration.refreshToken);

  await db.integration.update({
    where: { provider: "canva" },
    data: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? integration.refreshToken,
      expiresAt: tokenExpiresAt(tokens.expires_in),
      scopes: tokens.scope.split(" "),
    },
  });

  return { accessToken: tokens.access_token };
}

// ─── Canva API helpers ────────────────────────────────────────────────────────

async function canvaFetch(
  path: string,
  accessToken: string,
  options: RequestInit = {}
): Promise<Response> {
  const res = await fetch(`${CANVA_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(options.headers ?? {}),
    },
  });
  return res;
}

// ─── Autofill ─────────────────────────────────────────────────────────────────

export interface AutfillFields {
  headline?: string;
  subhead?: string;
  cta?: string;
  url?: string;
  version?: string;
  disclaimer?: string;
}

interface AutofillDataItem {
  type: "text";
  text: string;
}

/**
 * Create an autofill job that generates a design from a brand template
 * with the supplied field values.
 *
 * @param templateId  Canva Brand Template ID
 * @param fieldKeys   Mapping of canonical field name → Canva template field name
 * @param fields      Field values to inject
 * @param accessToken Valid Canva access token (never logged)
 * @returns The autofill job ID
 */
export async function createAutofillJob(
  templateId: string,
  fieldKeys: Record<string, string>,
  fields: AutfillFields,
  accessToken: string
): Promise<string> {
  const data: Record<string, AutofillDataItem> = {};

  for (const [canonical, canvaKey] of Object.entries(fieldKeys)) {
    const value = fields[canonical as keyof AutfillFields];
    if (value && value.trim()) {
      data[canvaKey] = { type: "text", text: value };
    }
  }

  const title = `Portal Export ${new Date().toISOString().slice(0, 19).replace("T", " ")}`;

  const res = await canvaFetch("/autofills", accessToken, {
    method: "POST",
    body: JSON.stringify({
      brand_template_id: templateId,
      title,
      data,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Canva autofill create failed (${res.status}): ${body}`);
  }

  const json = await res.json();
  return json.job.id as string;
}

interface AutofillJobResult {
  status: "in_progress" | "success" | "failed";
  designId?: string;
}

export async function pollAutofillJob(
  jobId: string,
  accessToken: string,
  maxAttempts = 30,
  intervalMs = 2000
): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await sleep(intervalMs);
    }

    const res = await canvaFetch(`/autofills/${jobId}`, accessToken);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Canva autofill poll failed (${res.status}): ${body}`);
    }

    const json = await res.json();
    const job = json.job as AutofillJobResult & {
      result?: { design?: { id: string } };
      error?: { code?: string; message?: string };
    };

    if (job.status === "success") {
      const designId = job.result?.design?.id;
      if (!designId) throw new Error("Canva autofill succeeded but returned no design ID");
      return designId;
    }

    if (job.status === "failed") {
      const reason = job.error?.message ?? job.error?.code ?? "unknown error";
      throw new Error(`Canva autofill job failed: ${reason}`);
    }

    // status === "in_progress" → continue polling
  }

  throw new Error(`Canva autofill job timed out after ${maxAttempts} attempts`);
}

// ─── Export ───────────────────────────────────────────────────────────────────

export async function createExportJob(
  designId: string,
  accessToken: string
): Promise<string> {
  const res = await canvaFetch("/exports", accessToken, {
    method: "POST",
    body: JSON.stringify({
      design_id: designId,
      format: {
        type: "png",
        export_quality: "regular",
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Canva export create failed (${res.status}): ${body}`);
  }

  const json = await res.json();
  return json.job.id as string;
}

export async function pollExportJob(
  jobId: string,
  accessToken: string,
  maxAttempts = 30,
  intervalMs = 2000
): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await sleep(intervalMs);
    }

    const res = await canvaFetch(`/exports/${jobId}`, accessToken);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Canva export poll failed (${res.status}): ${body}`);
    }

    const json = await res.json();
    const job = json.job as {
      status: "in_progress" | "success" | "failed";
      urls?: string[];
      error?: { code?: string; message?: string };
    };

    if (job.status === "success") {
      const downloadUrl = job.urls?.[0];
      if (!downloadUrl) throw new Error("Canva export succeeded but returned no URL");
      return downloadUrl;
    }

    if (job.status === "failed") {
      const reason = job.error?.message ?? job.error?.code ?? "unknown error";
      throw new Error(`Canva export job failed: ${reason}`);
    }
  }

  throw new Error(`Canva export job timed out after ${maxAttempts} attempts`);
}

// ─── Download ─────────────────────────────────────────────────────────────────

/** Download the exported PNG from the Canva CDN URL. */
export async function downloadExportBytes(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download Canva export (${res.status})`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ─── End-to-end: generate design → PNG bytes ─────────────────────────────────

/**
 * Full pipeline:
 *   1. Create autofill job (template + fields → design)
 *   2. Poll until design is ready
 *   3. Create PNG export job
 *   4. Poll until export is ready
 *   5. Download and return PNG bytes + Canva design ID
 */
export async function generateCanvaDesign(params: {
  templateId: string;
  fieldKeys: Record<string, string>;
  fields: AutfillFields;
  accessToken: string;
}): Promise<{ bytes: Buffer; filename: string }> {
  const { templateId, fieldKeys, fields, accessToken } = params;

  const autofillJobId = await createAutofillJob(
    templateId,
    fieldKeys,
    fields,
    accessToken
  );

  const designId = await pollAutofillJob(autofillJobId, accessToken);

  const exportJobId = await createExportJob(designId, accessToken);
  const downloadUrl = await pollExportJob(exportJobId, accessToken);

  const bytes = await downloadExportBytes(downloadUrl);

  const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
  const filename = `canva-${templateId.toLowerCase()}-${timestamp}.png`;

  return { bytes, filename };
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
