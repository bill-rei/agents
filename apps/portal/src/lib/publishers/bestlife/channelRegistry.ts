/**
 * Best Life channel registry.
 * Single source of truth for channel metadata, publish modes, and character limits.
 * Loaded from targets/bestlife-social.json at module init.
 */

import path from "path";
import fs from "fs";

export type PublishMode = "direct" | "assist";

export interface BestLifeChannelConfig {
  key: string;
  label: string;
  profileUrl: string;
  publishMode: PublishMode;
  charLimit: number;
  supportsText: boolean;
  supportsImages: boolean;
  supportsVideo: boolean;
  envVarPrefix: string;
  notes?: string;
}

// ── Load from JSON ────────────────────────────────────────────────────────────

function loadChannels(): BestLifeChannelConfig[] {
  const jsonPath = path.resolve(
    process.cwd(),
    "../../targets/bestlife-social.json"
  );

  // Fallback path for test execution from portal root
  const altPath = path.resolve(
    process.cwd(),
    "../../../targets/bestlife-social.json"
  );

  let raw: string;
  if (fs.existsSync(jsonPath)) {
    raw = fs.readFileSync(jsonPath, "utf8");
  } else if (fs.existsSync(altPath)) {
    raw = fs.readFileSync(altPath, "utf8");
  } else {
    throw new Error(`bestlife-social.json not found. Tried: ${jsonPath}`);
  }

  const json = JSON.parse(raw) as {
    channels: Record<
      string,
      Omit<BestLifeChannelConfig, "key">
    >;
  };

  return Object.entries(json.channels).map(([key, val]) => ({
    key,
    ...val,
  }));
}

// Lazily loaded so tests / Next.js edge cases don't break on import
let _channels: BestLifeChannelConfig[] | null = null;

function getChannels(): BestLifeChannelConfig[] {
  if (!_channels) _channels = loadChannels();
  return _channels;
}

// ── Public helpers ────────────────────────────────────────────────────────────

export function getAllChannels(): BestLifeChannelConfig[] {
  return getChannels();
}

export function getChannel(key: string): BestLifeChannelConfig {
  const ch = getChannels().find((c) => c.key === key);
  if (!ch) throw new Error(`Unknown BestLife channel key: "${key}"`);
  return ch;
}

export function getCharLimit(key: string): number {
  return getChannel(key).charLimit;
}

/** Keys that go through the direct API publish path */
export function getDirectChannelKeys(): string[] {
  return getChannels()
    .filter((c) => c.publishMode === "direct")
    .map((c) => c.key);
}

/** Keys that go into the Publish Assist Pack */
export function getAssistChannelKeys(): string[] {
  return getChannels()
    .filter((c) => c.publishMode === "assist")
    .map((c) => c.key);
}

/** Returns true if the key is a known BestLife channel */
export function isValidChannelKey(key: string): boolean {
  return getChannels().some((c) => c.key === key);
}

/** Returns all known channel keys */
export function getAllChannelKeys(): string[] {
  return getChannels().map((c) => c.key);
}

/**
 * Truncate text to the channel's character limit, breaking at the last
 * word boundary before the limit and appending "…" if truncated.
 */
export function truncateForChannel(text: string, channelKey: string): string {
  const limit = getCharLimit(channelKey);
  if (text.length <= limit) return text;

  // Reserve 1 char for ellipsis
  const target = limit - 1;
  const slice = text.slice(0, target);
  const lastSpace = slice.lastIndexOf(" ");
  const cut = lastSpace > 0 ? slice.slice(0, lastSpace) : slice;
  return cut + "…";
}
