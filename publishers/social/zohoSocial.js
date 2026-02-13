#!/usr/bin/env node
require("dotenv").config({ path: require("path").join(__dirname, "..", "..", ".env") });

const fs = require("fs");
const path = require("path");
const { validateArtifact } = require("../../marketing-artifacts");

const LOG_PATH = path.join(__dirname, "..", "..", "publish-log.jsonl");

const SUPPORTED_PLATFORMS = ["linkedin", "x", "facebook", "instagram"];

// Zoho Social maps our platform names to their channel types
const ZOHO_CHANNEL_TYPE = {
  linkedin: "LinkedIn",
  x: "Twitter",
  facebook: "Facebook",
  instagram: "Instagram",
};

// ── Zoho config resolution ──

function resolveZohoConfig() {
  const clientId = process.env.ZOHO_SOCIAL_CLIENT_ID;
  const clientSecret = process.env.ZOHO_SOCIAL_CLIENT_SECRET;
  const refreshToken = process.env.ZOHO_SOCIAL_REFRESH_TOKEN;
  const zsid = process.env.ZOHO_SOCIAL_ZSID;
  const baseUrl = (process.env.ZOHO_SOCIAL_API_BASE || "https://social.zoho.com").replace(/\/$/, "");

  if (!clientId || !clientSecret || !refreshToken || !zsid) {
    throw new Error(
      "Missing Zoho Social env vars. Expected: ZOHO_SOCIAL_CLIENT_ID, ZOHO_SOCIAL_CLIENT_SECRET, " +
      "ZOHO_SOCIAL_REFRESH_TOKEN, ZOHO_SOCIAL_ZSID"
    );
  }

  return { clientId, clientSecret, refreshToken, zsid, baseUrl };
}

// ── OAuth2 token exchange ──
// TODO: Implement token caching (access tokens last ~1 hour).
//       For now, refreshes on every call.

async function getAccessToken(config) {
  // TODO: Replace with actual Zoho OAuth2 token refresh call.
  //
  // Sample request:
  //   POST https://accounts.zoho.com/oauth/v2/token
  //   Content-Type: application/x-www-form-urlencoded
  //
  //   grant_type=refresh_token
  //   &client_id={ZOHO_SOCIAL_CLIENT_ID}
  //   &client_secret={ZOHO_SOCIAL_CLIENT_SECRET}
  //   &refresh_token={ZOHO_SOCIAL_REFRESH_TOKEN}
  //
  // Sample response:
  //   { "access_token": "1000.xxxx", "token_type": "Bearer", "expires_in": 3600 }

  throw new Error(
    "Zoho OAuth2 not yet integrated. " +
    "Implement token refresh at publishers/social/zohoSocial.js:getAccessToken()"
  );
}

// ── Channel ID lookup ──

async function getChannelId(config, accessToken, platform) {
  // TODO: Look up the channel ID for this platform from Zoho Social.
  //
  // Sample request:
  //   GET https://social.zoho.com/api/v1/{zsid}/channels
  //   Authorization: Bearer {access_token}
  //
  // Sample response:
  //   { "data": [
  //       { "channel_id": "123456", "channel_type": "LinkedIn", "channel_name": "LLIF LinkedIn" },
  //       { "channel_id": "789012", "channel_type": "Twitter", "channel_name": "LLIF X" }
  //   ]}
  //
  // Match on channel_type === ZOHO_CHANNEL_TYPE[platform]
  // Optionally filter by env var ZOHO_SOCIAL_CHANNEL_{PLATFORM} override.

  const overrideKey = `ZOHO_SOCIAL_CHANNEL_${platform.toUpperCase()}`;
  const override = process.env[overrideKey];
  if (override) return override;

  throw new Error(
    `No channel ID for "${platform}". Set ${overrideKey} env var or implement API lookup ` +
    "at publishers/social/zohoSocial.js:getChannelId()"
  );
}

// ── Post creation ──

async function createZohoPost(config, accessToken, channelId, payload) {
  // TODO: Implement actual Zoho Social API call.
  //
  // Draft post:
  //   POST https://social.zoho.com/api/v1/{zsid}/draft
  //   Authorization: Bearer {access_token}
  //   Content-Type: application/json
  //
  //   {
  //     "channel_ids": ["123456"],
  //     "text_content": "Post body here #hashtag",
  //     "media_urls": ["https://..."]           // optional
  //   }
  //
  // Scheduled post:
  //   POST https://social.zoho.com/api/v1/{zsid}/post
  //   Authorization: Bearer {access_token}
  //   Content-Type: application/json
  //
  //   {
  //     "channel_ids": ["123456"],
  //     "text_content": "Post body here",
  //     "schedule_time": "2026-02-14T15:00:00+0000",  // ISO-ish
  //     "post_type": "SchedulePost"
  //   }
  //
  // Immediate post:
  //   Same as scheduled but with "post_type": "PublishNow"
  //
  // Sample response:
  //   { "data": { "post_id": "45678", "status": "Draft", "url": "https://..." } }

  throw new Error(
    "Zoho Social API not yet integrated. " +
    "Implement at publishers/social/zohoSocial.js:createZohoPost()"
  );
}

// ── Logging ──

function appendLog(entry) {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), ...entry }) + "\n";
  fs.appendFileSync(LOG_PATH, line, "utf8");
}

// ── Build Zoho payload from artifact ──

function buildZohoPayload(artifact, channelId) {
  const { content, schedule_at } = artifact;

  let textContent = content.body;
  if (content.hashtags && content.hashtags.length) {
    textContent += "\n\n" + content.hashtags.join(" ");
  }

  const payload = {
    channel_ids: [channelId],
    text_content: textContent,
  };

  if (content.media_urls && content.media_urls.length) {
    payload.media_urls = content.media_urls;
  }

  // Determine post mode
  if (schedule_at) {
    payload.schedule_time = schedule_at;
    payload.post_type = "SchedulePost";
  } else if (artifact.status === "published" && artifact.human_approval === true) {
    payload.post_type = "PublishNow";
  } else {
    // Everything else becomes a draft — safe default
    payload.post_type = "Draft";
  }

  return payload;
}

// ── Main publish function ──

async function publish(artifact, opts = {}) {
  const { dryRun = false } = opts;

  // 1. Validate type
  if (!artifact || artifact.artifact_type !== "social_post") {
    throw new Error(`Expected artifact_type "social_post", got "${artifact?.artifact_type}"`);
  }

  const result = validateArtifact(artifact);
  if (!result.valid) {
    throw new Error(`Artifact validation failed:\n  - ${result.errors.join("\n  - ")}`);
  }

  const { target } = artifact;

  // 2. Check platform support
  if (!SUPPORTED_PLATFORMS.includes(target.platform)) {
    throw new Error(
      `Platform "${target.platform}" is not supported by Zoho Social adapter. ` +
      `Supported: ${SUPPORTED_PLATFORMS.join(", ")}`
    );
  }

  // 3. Safety: never post live without explicit approval
  if (artifact.status === "published" && artifact.human_approval !== true) {
    throw new Error(
      'Refusing to publish live: artifact.status is "published" but human_approval is not true. ' +
      "Set human_approval: true to confirm live posting."
    );
  }

  // 4. Dry-run: resolve what we can, print the rest
  if (dryRun) {
    const channelId = process.env[`ZOHO_SOCIAL_CHANNEL_${target.platform.toUpperCase()}`] || "(needs lookup)";
    const payload = buildZohoPayload(artifact, channelId);
    const mode = payload.post_type;

    console.log(`  [dry-run] Platform: ${target.platform} (Zoho channel type: ${ZOHO_CHANNEL_TYPE[target.platform]})`);
    console.log(`  [dry-run] Post mode: ${mode}`);
    if (artifact.schedule_at) console.log(`  [dry-run] Scheduled for: ${artifact.schedule_at}`);
    console.log(`  [dry-run] Zoho payload:`, JSON.stringify(payload, null, 2));
    return { status: "dry-run", postType: mode };
  }

  // 5. Live path — requires Zoho API integration
  const config = resolveZohoConfig();
  const accessToken = await getAccessToken(config);
  const channelId = await getChannelId(config, accessToken, target.platform);
  const payload = buildZohoPayload(artifact, channelId);
  const zohoResult = await createZohoPost(config, accessToken, channelId, payload);

  // 6. Log
  appendLog({
    adapter: "zoho-social",
    artifact_id: artifact.artifact_id,
    platform: target.platform,
    post_type: payload.post_type,
    zoho_post_id: zohoResult.data?.post_id,
    status: zohoResult.data?.status,
    url: zohoResult.data?.url,
  });

  console.log(`  Published to ${target.platform} via Zoho Social -> ${zohoResult.data?.url}`);
  return {
    status: zohoResult.data?.status,
    postId: zohoResult.data?.post_id,
    url: zohoResult.data?.url,
  };
}

module.exports = { publish, SUPPORTED_PLATFORMS };
