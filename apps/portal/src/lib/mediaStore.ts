/**
 * MediaStore helpers for resolving UCS media refs to publishable URLs.
 *
 * UCS canonical.mediaRefs[].ref can be:
 *   - A public URL  (https://...)  → use directly
 *   - A file path   (media/...)    → requires platform-specific upload (not yet implemented)
 */

import type { MediaAsset } from "@/connectors/types";

/**
 * Returns a publicly accessible URL for the given ref, or null if the ref
 * is a local file path that has not yet been uploaded to a CDN.
 */
export function resolveMediaUrl(ref: string): string | null {
  if (/^https?:\/\//.test(ref)) return ref;
  return null; // file-based — must be uploaded before publishing
}

/**
 * Infer media type from a ref string (URL or file path).
 * Defaults to "image" when the extension is ambiguous.
 */
export function inferMediaType(ref: string): "image" | "video" {
  const lower = ref.toLowerCase();
  if (/\.(mp4|mov|avi|webm|mkv|m4v)(\?|$)/.test(lower)) return "video";
  return "image";
}

/**
 * Build a MediaAsset from a UCS media ref string.
 */
export function buildMediaAsset(ref: string): MediaAsset {
  return {
    ref,
    type: inferMediaType(ref),
    url: resolveMediaUrl(ref),
  };
}
