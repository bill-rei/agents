require("dotenv").config({ path: require("path").join(__dirname, "..", "..", ".env") });

const fs = require("fs");
const path = require("path");
const { validateArtifact } = require("../../marketing-artifacts");

const LOG_PATH = path.join(__dirname, "..", "..", "publish-log.jsonl");
const LI_API_BASE = "https://api.linkedin.com/rest";
const LI_API_VERSION = "202402";

// ── Config ──

function resolveLinkedInConfig() {
  const accessToken = process.env.LINKEDIN_ACCESS_TOKEN;
  const orgId = process.env.LINKEDIN_ORG_ID;
  const personId = process.env.LINKEDIN_PERSON_ID;

  if (!accessToken) {
    throw new Error("Missing env var: LINKEDIN_ACCESS_TOKEN");
  }

  return { accessToken, orgId, personId };
}

// ── Logging (never prints tokens) ──

function appendLog(entry) {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), ...entry }) + "\n";
  fs.appendFileSync(LOG_PATH, line, "utf8");
}

function logSafe(msg, data) {
  if (data) {
    const safe = { ...data };
    for (const key of Object.keys(safe)) {
      if (/token|secret|key|password|auth/i.test(key)) safe[key] = "***";
    }
    console.log(msg, JSON.stringify(safe, null, 2));
  } else {
    console.log(msg);
  }
}

// ── Author URN resolution ──

function resolveAuthorUrn(config, accountType) {
  if (accountType === "organization") {
    if (!config.orgId) {
      throw new Error(
        'target.account_type is "organization" but LINKEDIN_ORG_ID env var is not set.'
      );
    }
    return `urn:li:organization:${config.orgId}`;
  }

  // Default to person
  if (!config.personId) {
    throw new Error(
      'target.account_type is "person" (or unset) but LINKEDIN_PERSON_ID env var is not set.'
    );
  }
  return `urn:li:person:${config.personId}`;
}

// ── Build LinkedIn post payload ──
// LinkedIn Posts API (v2): https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api

function buildLinkedInPayload(artifact, authorUrn) {
  let commentary = artifact.content.body;
  if (artifact.content.hashtags && artifact.content.hashtags.length) {
    commentary += "\n\n" + artifact.content.hashtags.join(" ");
  }

  const payload = {
    author: authorUrn,
    commentary,
    visibility: "PUBLIC",
    distribution: {
      feedDistribution: "MAIN_FEED",
    },
    lifecycleState: "PUBLISHED",
  };

  // Add article/link share if CTA contains a URL
  if (artifact.content.cta) {
    commentary += `\n\n${artifact.content.cta}`;
    payload.commentary = commentary;
  }

  return payload;
}

// ── Post to LinkedIn ──

async function createPost(config, payload) {
  const url = `${LI_API_BASE}/posts`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
      "LinkedIn-Version": LI_API_VERSION,
    },
    body: JSON.stringify(payload),
  });

  // LinkedIn returns 201 with x-restli-id header on success
  if (res.status === 201) {
    const postId = res.headers.get("x-restli-id") || res.headers.get("x-linkedin-id");
    return { postId, status: "created" };
  }

  let errBody;
  try {
    errBody = await res.json();
  } catch {
    errBody = await res.text();
  }
  const detail = typeof errBody === "object" ? (errBody.message || JSON.stringify(errBody)) : errBody;
  throw new Error(`LinkedIn API error (${res.status}): ${detail}`);
}

// ── Safety checks ──

function enforceSafety(artifact, opts) {
  if (artifact.status === "published") {
    if (artifact.human_approval !== true) {
      throw new Error(
        'Live post blocked: artifact.status is "published" but human_approval is not true.'
      );
    }
    if (!opts.forceLive) {
      throw new Error(
        'Live post blocked: artifact.status is "published" and human_approval is true, ' +
        "but --force-live flag was not passed. Add --force-live to confirm."
      );
    }
    return "live";
  }

  if (artifact.schedule_at) {
    throw new Error(
      "LinkedIn API does not support scheduling. Use the Zoho Social adapter for scheduled posts."
    );
  }

  throw new Error(
    "LinkedIn direct adapter only supports live posting (artifact.status must be \"published\" " +
    "with human_approval: true and --force-live flag). " +
    "For drafts or scheduling, use the Zoho Social adapter."
  );
}

// ── Main publish function ──

async function publish(artifact, opts = {}) {
  const { dryRun = false, forceLive = false } = opts;

  if (!artifact || artifact.artifact_type !== "social_post") {
    throw new Error(`Expected artifact_type "social_post", got "${artifact?.artifact_type}"`);
  }
  if (artifact.target?.platform !== "linkedin") {
    throw new Error(`Expected platform "linkedin", got "${artifact.target?.platform}"`);
  }

  const result = validateArtifact(artifact);
  if (!result.valid) {
    throw new Error(`Artifact validation failed:\n  - ${result.errors.join("\n  - ")}`);
  }

  const mode = enforceSafety(artifact, { forceLive });
  const accountType = artifact.target.account_type || "person";

  if (dryRun) {
    const authorUrn = `urn:li:${accountType}:${accountType === "organization" ? (process.env.LINKEDIN_ORG_ID || "???") : (process.env.LINKEDIN_PERSON_ID || "???")}`;
    const payload = buildLinkedInPayload(artifact, authorUrn);

    logSafe(`  [dry-run] LinkedIn direct post — mode: ${mode}, account: ${accountType}`);
    console.log(`  [dry-run] Author URN: ${authorUrn}`);
    console.log(`  [dry-run] Payload:`, JSON.stringify(payload, null, 2));
    return { status: "dry-run", accountType };
  }

  // Live path
  const config = resolveLinkedInConfig();
  const authorUrn = resolveAuthorUrn(config, accountType);
  const payload = buildLinkedInPayload(artifact, authorUrn);

  logSafe(`  Posting to LinkedIn as ${accountType} (${authorUrn})...`);
  const postResult = await createPost(config, payload);

  const postUrl = postResult.postId
    ? `https://www.linkedin.com/feed/update/${postResult.postId}`
    : null;

  appendLog({
    adapter: "linkedin-direct",
    artifact_id: artifact.artifact_id,
    platform: "linkedin",
    account_type: accountType,
    post_id: postResult.postId,
    url: postUrl,
  });

  logSafe(`  Posted to LinkedIn -> ${postUrl || "(no URL)"}`);
  return { status: "posted", postId: postResult.postId, url: postUrl };
}

module.exports = { publish };
