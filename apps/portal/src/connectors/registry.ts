import { xConnector } from "./x";
import { linkedinConnector } from "./linkedin";
import { instagramConnector } from "./instagram";
import { tiktokConnector } from "./tiktok";
import type { PublishConnector, SupportedPlatform } from "./types";

export const CONNECTORS: Record<SupportedPlatform, PublishConnector> = {
  x: xConnector,
  linkedin: linkedinConnector,
  instagram: instagramConnector,
  tiktok: tiktokConnector,
};

export function getConnector(platform: string): PublishConnector {
  const c = CONNECTORS[platform as SupportedPlatform];
  if (!c) throw new Error(`No connector for platform: ${platform}`);
  return c;
}

/** Platforms that support direct text-only publishing. */
export const TEXT_ONLY_PLATFORMS: SupportedPlatform[] = ["x", "linkedin"];

/** Platforms that require image/video for every post. */
export const MEDIA_REQUIRED_PLATFORMS: SupportedPlatform[] = ["instagram"];

/** Platforms where publishing is pending app audit/review. */
export const AUDIT_REQUIRED_PLATFORMS: SupportedPlatform[] = ["tiktok"];
