require("dotenv").config({ path: require("path").join(__dirname, "..", "..", ".env") });

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { validateArtifact } = require("../../marketing-artifacts");

const LOG_PATH = path.join(__dirname, "..", "..", "publish-log.jsonl");
const X_TWEET_MAX = 280;
const X_API_BASE = "https://api.x.com/2";

// ── OAuth 1.0a signing ──

function percentEncode(str) {
  return encodeURIComponent(str).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

function buildOAuthHeader(method, url, params, credentials) {
  const oauthParams = {
    oauth_consumer_key: credentials.apiKey,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: credentials.accessToken,
    oauth_version: "1.0",
  };

  const allParams = { ...oauthParams, ...params };
  const paramString = Object.keys(allParams)
    .sort()
    .map((k) => `${percentEncode(k)}=${percentEncode(allParams[k])}`)
    .join("&");

  const baseString = [method.toUpperCase(), percentEncode(url), percentEncode(paramString)].join("&");
  const signingKey = `${percentEncode(credentials.apiSecret)}&${percentEncode(credentials.accessTokenSecret)}`;
  const signature = crypto.createHmac("sha1", signingKey).update(baseString).digest("base64");

  oauthParams.oauth_signature = signature;

  const headerParts = Object.keys(oauthParams)
    .sort()
    .map((k) => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`)
    .join(", ");

  return `OAuth ${headerParts}`;
}

// ── Config ──

function resolveXConfig() {
  const apiKey = process.env.X_API_KEY;
  const apiSecret = process.env.X_API_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessTokenSecret = process.env.X_ACCESS_TOKEN_SECRET;

  if (!apiKey || !apiSecret || !accessToken || !accessTokenSecret) {
    throw new Error(
      "Missing X API env vars. Expected: X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET"
    );
  }

  return { apiKey, apiSecret, accessToken, accessTokenSecret };
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

// ── Tweet posting ──

async function postTweet(credentials, text, replyToId) {
  const url = `${X_API_BASE}/tweets`;
  const body = { text };
  if (replyToId) body.reply = { in_reply_to_tweet_id: replyToId };

  const authHeader = buildOAuthHeader("POST", url, {}, credentials);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: authHeader,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok) {
    const detail = data.detail || data.title || JSON.stringify(data);
    throw new Error(`X API error (${res.status}): ${detail}`);
  }

  return data.data; // { id, text }
}

// ── Thread splitting ──

function splitThread(fullText) {
  if (fullText.length <= X_TWEET_MAX) return [fullText];

  const chunks = [];
  const paragraphs = fullText.split(/\n\n+/);
  let current = "";

  for (const para of paragraphs) {
    const candidate = current ? `${current}\n\n${para}` : para;
    if (candidate.length <= X_TWEET_MAX) {
      current = candidate;
    } else if (current) {
      chunks.push(current);
      // If a single paragraph exceeds limit, split on sentences
      if (para.length > X_TWEET_MAX) {
        chunks.push(...splitLongParagraph(para));
        current = "";
      } else {
        current = para;
      }
    } else {
      chunks.push(...splitLongParagraph(para));
    }
  }
  if (current) chunks.push(current);

  return chunks;
}

function splitLongParagraph(text) {
  const chunks = [];
  const sentences = text.match(/[^.!?]+[.!?]+\s*/g) || [text];
  let current = "";

  for (const sentence of sentences) {
    const candidate = current + sentence;
    if (candidate.length <= X_TWEET_MAX) {
      current = candidate;
    } else {
      if (current) chunks.push(current.trim());
      current = sentence;
    }
  }
  if (current) chunks.push(current.trim());
  return chunks;
}

// ── Build post text ──

function buildPostText(artifact) {
  let text = artifact.content.body;
  if (artifact.content.hashtags && artifact.content.hashtags.length) {
    text += "\n\n" + artifact.content.hashtags.join(" ");
  }
  return text;
}

// ── Safety checks ──

function enforceSafety(artifact, opts) {
  // Live posting requires: status=published + human_approval + --force-live
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

  // X API has no draft or scheduling support
  if (artifact.schedule_at) {
    throw new Error(
      "X API does not support scheduling. Use the Zoho Social adapter for scheduled posts."
    );
  }

  throw new Error(
    "X direct adapter only supports live posting (artifact.status must be \"published\" " +
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
  if (artifact.target?.platform !== "x") {
    throw new Error(`Expected platform "x", got "${artifact.target?.platform}"`);
  }

  const result = validateArtifact(artifact);
  if (!result.valid) {
    throw new Error(`Artifact validation failed:\n  - ${result.errors.join("\n  - ")}`);
  }

  const mode = enforceSafety(artifact, { forceLive });
  const fullText = buildPostText(artifact);
  const tweets = splitThread(fullText);

  if (dryRun) {
    logSafe(`  [dry-run] X direct post — ${tweets.length} tweet(s), mode: ${mode}`);
    for (let i = 0; i < tweets.length; i++) {
      console.log(`  [dry-run] Tweet ${i + 1}/${tweets.length} (${tweets[i].length} chars):`);
      console.log(`  ${tweets[i]}`);
    }
    return { status: "dry-run", tweetCount: tweets.length };
  }

  // Live path
  const credentials = resolveXConfig();
  const posted = [];

  for (let i = 0; i < tweets.length; i++) {
    const replyTo = i > 0 ? posted[i - 1].id : undefined;
    logSafe(`  Posting tweet ${i + 1}/${tweets.length}...`);
    const result = await postTweet(credentials, tweets[i], replyTo);
    posted.push(result);
  }

  const firstId = posted[0].id;
  const tweetUrl = `https://x.com/i/status/${firstId}`;

  appendLog({
    adapter: "x-direct",
    artifact_id: artifact.artifact_id,
    platform: "x",
    tweet_ids: posted.map((t) => t.id),
    tweet_count: posted.length,
    url: tweetUrl,
  });

  logSafe(`  Posted ${posted.length} tweet(s) -> ${tweetUrl}`);
  return { status: "posted", tweetCount: posted.length, tweetIds: posted.map((t) => t.id), url: tweetUrl };
}

module.exports = { publish };
