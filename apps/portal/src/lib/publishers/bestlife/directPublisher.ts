/**
 * Best Life – Direct Social Publisher
 *
 * Adapters for X (Twitter), LinkedIn, and Facebook.
 * Each adapter reads credentials from process.env (never from user input).
 *
 * TODO (Phase 2): replace stub token fetching with real OAuth refresh flows
 * once API access is provisioned.
 */

export interface ChannelResult {
  mode: "direct" | "assist";
  status: "success" | "failed" | "skipped";
  postId?: string;
  postUrl?: string;
  error?: string;
  durationMs: number;
}

export interface SocialArtifact {
  id: string;
  title: string;
  body: string;            // main post copy (already truncated for channel)
  hashtags: string[];
  mediaUrls: string[];     // absolute URLs to attached images
  linkUrl?: string;        // optional canonical URL to include
}

// ── X (Twitter) ──────────────────────────────────────────────────────────────

interface XCredentials {
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  accessTokenSecret: string;
}

function getXCredentials(): XCredentials | null {
  const apiKey = process.env.BLA_X_API_KEY;
  const apiSecret = process.env.BLA_X_API_SECRET;
  const accessToken = process.env.BLA_X_ACCESS_TOKEN;
  const accessTokenSecret = process.env.BLA_X_ACCESS_TOKEN_SECRET;

  if (!apiKey || !apiSecret || !accessToken || !accessTokenSecret) return null;
  return { apiKey, apiSecret, accessToken, accessTokenSecret };
}

/**
 * Publish a text tweet via Twitter v2 API.
 * TODO: add OAuth 1.0a request signing (use 'oauth-1.0a' or similar library).
 * TODO: add media upload step when mediaUrls are present and BLA_X_TIER=elevated.
 */
export async function publishToX(artifact: SocialArtifact): Promise<ChannelResult> {
  const start = Date.now();
  const creds = getXCredentials();

  if (!creds) {
    return {
      mode: "direct",
      status: "failed",
      error: "BLA_X_* env vars not configured. Set BLA_X_API_KEY, BLA_X_API_SECRET, BLA_X_ACCESS_TOKEN, BLA_X_ACCESS_TOKEN_SECRET.",
      durationMs: Date.now() - start,
    };
  }

  const text = buildPostText(artifact, 280);

  try {
    // TODO: replace with OAuth 1.0a signed request once oauth-1.0a is installed
    // The Authorization header must be built using HMAC-SHA1 signing:
    // Authorization: OAuth oauth_consumer_key="...", oauth_token="...", oauth_signature="..."
    const response = await fetch("https://api.twitter.com/2/tweets", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // TODO: "Authorization": buildOAuth1Header(creds, "POST", "https://api.twitter.com/2/tweets", { text })
        Authorization: `Bearer ${creds.accessToken}`, // placeholder — replace with OAuth 1.0a
      },
      body: JSON.stringify({ text }),
    });

    const durationMs = Date.now() - start;

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      return {
        mode: "direct",
        status: "failed",
        error: `Twitter API ${response.status}: ${JSON.stringify(body)}`,
        durationMs,
      };
    }

    const data = (await response.json()) as { data?: { id: string } };
    const postId = data.data?.id;

    return {
      mode: "direct",
      status: "success",
      postId,
      postUrl: postId ? `https://x.com/getbestlifeapp/status/${postId}` : undefined,
      durationMs,
    };
  } catch (err) {
    return {
      mode: "direct",
      status: "failed",
      error: (err as Error).message,
      durationMs: Date.now() - start,
    };
  }
}

// ── LinkedIn ──────────────────────────────────────────────────────────────────

interface LinkedInCredentials {
  accessToken: string;
  pageId: string;  // organization URN id, e.g. "123456789"
}

function getLinkedInCredentials(): LinkedInCredentials | null {
  const accessToken = process.env.BLA_LINKEDIN_ACCESS_TOKEN;
  const pageId = process.env.BLA_LINKEDIN_PAGE_ID;
  if (!accessToken || !pageId) return null;
  return { accessToken, pageId };
}

/**
 * Publish to a LinkedIn company page via the UGC Posts API.
 * TODO: implement OAuth 2.0 token refresh when token expires (60-day lifetime).
 */
export async function publishToLinkedIn(artifact: SocialArtifact): Promise<ChannelResult> {
  const start = Date.now();
  const creds = getLinkedInCredentials();

  if (!creds) {
    return {
      mode: "direct",
      status: "failed",
      error: "BLA_LINKEDIN_* env vars not configured. Set BLA_LINKEDIN_ACCESS_TOKEN and BLA_LINKEDIN_PAGE_ID.",
      durationMs: Date.now() - start,
    };
  }

  const text = buildPostText(artifact, 3000);
  const author = `urn:li:organization:${creds.pageId}`;

  const ugcPost = {
    author,
    lifecycleState: "PUBLISHED",
    specificContent: {
      "com.linkedin.ugc.ShareContent": {
        shareCommentary: { text },
        shareMediaCategory: artifact.linkUrl ? "ARTICLE" : "NONE",
        ...(artifact.linkUrl
          ? {
              media: [
                {
                  status: "READY",
                  originalUrl: artifact.linkUrl,
                  title: { text: artifact.title },
                },
              ],
            }
          : {}),
      },
    },
    visibility: { "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC" },
  };

  try {
    const response = await fetch("https://api.linkedin.com/v2/ugcPosts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${creds.accessToken}`,
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify(ugcPost),
    });

    const durationMs = Date.now() - start;

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      return {
        mode: "direct",
        status: "failed",
        error: `LinkedIn API ${response.status}: ${JSON.stringify(body)}`,
        durationMs,
      };
    }

    // LinkedIn returns post ID in the x-linkedin-id header or response body
    const postId =
      response.headers.get("x-linkedin-id") ||
      ((await response.json().catch(() => ({}))) as Record<string, string>).id ||
      undefined;

    return {
      mode: "direct",
      status: "success",
      postId,
      postUrl: postId
        ? `https://www.linkedin.com/feed/update/${postId}`
        : undefined,
      durationMs,
    };
  } catch (err) {
    return {
      mode: "direct",
      status: "failed",
      error: (err as Error).message,
      durationMs: Date.now() - start,
    };
  }
}

// ── Facebook ──────────────────────────────────────────────────────────────────

interface FacebookCredentials {
  pageAccessToken: string;
  pageId: string;
}

function getFacebookCredentials(): FacebookCredentials | null {
  const pageAccessToken = process.env.BLA_FACEBOOK_PAGE_ACCESS_TOKEN;
  const pageId = process.env.BLA_FACEBOOK_PAGE_ID;
  if (!pageAccessToken || !pageId) return null;
  return { pageAccessToken, pageId };
}

/**
 * Publish to a Facebook Page via Graph API v21.0.
 * TODO: add media upload step for image posts (requires separate /photos endpoint).
 */
export async function publishToFacebook(artifact: SocialArtifact): Promise<ChannelResult> {
  const start = Date.now();
  const creds = getFacebookCredentials();

  if (!creds) {
    return {
      mode: "direct",
      status: "failed",
      error: "BLA_FACEBOOK_* env vars not configured. Set BLA_FACEBOOK_PAGE_ACCESS_TOKEN and BLA_FACEBOOK_PAGE_ID.",
      durationMs: Date.now() - start,
    };
  }

  const message = buildPostText(artifact, 63206);

  const params = new URLSearchParams({
    message,
    access_token: creds.pageAccessToken,
    ...(artifact.linkUrl ? { link: artifact.linkUrl } : {}),
  });

  try {
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${creds.pageId}/feed`,
      { method: "POST", body: params }
    );

    const durationMs = Date.now() - start;

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      return {
        mode: "direct",
        status: "failed",
        error: `Facebook API ${response.status}: ${JSON.stringify(body)}`,
        durationMs,
      };
    }

    const data = (await response.json()) as { id?: string };
    const postId = data.id;

    return {
      mode: "direct",
      status: "success",
      postId,
      postUrl: postId
        ? `https://www.facebook.com/${postId}`
        : undefined,
      durationMs,
    };
  } catch (err) {
    return {
      mode: "direct",
      status: "failed",
      error: (err as Error).message,
      durationMs: Date.now() - start,
    };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build the final post text: body + hashtags, truncated to limit. */
function buildPostText(artifact: SocialArtifact, limit: number): string {
  const hashtagStr =
    artifact.hashtags.length > 0
      ? "\n\n" + artifact.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)).join(" ")
      : "";

  const full = artifact.body + hashtagStr;
  if (full.length <= limit) return full;

  // Truncate body to fit hashtags within limit
  const reserve = hashtagStr.length + 1; // +1 for ellipsis
  const bodyLimit = limit - reserve;
  const truncBody = artifact.body.slice(0, bodyLimit);
  const lastSpace = truncBody.lastIndexOf(" ");
  return (lastSpace > 0 ? truncBody.slice(0, lastSpace) : truncBody) + "…" + hashtagStr;
}
