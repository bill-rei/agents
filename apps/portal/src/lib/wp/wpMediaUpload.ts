/**
 * lib/wp/wpMediaUpload.ts — Upload media files to a WordPress Media Library
 *
 * Uses the WP REST API v2 multipart upload:
 *   POST /wp-json/wp/v2/media  (multipart/form-data)
 *
 * Reuses credentials from wpClient.ts.
 */
import { getWpCredentials, basicAuthHeader } from "./wpClient";
import type { Brand } from "@/lib/designContract/schema";

export interface WpMediaResult {
  /** WordPress media item ID */
  id: number;
  /** Public URL of the uploaded file */
  url: string;
  /** WordPress media slug */
  slug: string;
  /** Alt text set on the media item */
  altText: string;
}

/**
 * Upload binary file data to the WordPress Media Library.
 *
 * @param brand      'llif' or 'bestlife' — determines which WP site to use
 * @param filename   Filename including extension (e.g. "design.png")
 * @param mimeType   MIME type of the file (e.g. "image/png")
 * @param data       File bytes as a Buffer
 * @param altText    Optional alt text to set on the media item
 */
export async function uploadWpMedia(
  brand: Brand,
  filename: string,
  mimeType: string,
  data: Buffer,
  altText?: string
): Promise<WpMediaResult> {
  const creds = getWpCredentials(brand);
  const auth = basicAuthHeader(creds.username, creds.appPassword);

  // Copy data into a fresh ArrayBuffer — Node.js Buffer uses ArrayBufferLike
  // but TypeScript's Blob/BodyInit requires a strict ArrayBuffer.
  const ab = new ArrayBuffer(data.byteLength);
  new Uint8Array(ab).set(data);

  const formData = new FormData();
  formData.append("file", new Blob([ab], { type: mimeType }), encodeFilename(filename));

  const res = await fetch(`${creds.baseUrl}/wp-json/wp/v2/media`, {
    method: "POST",
    headers: {
      Authorization: auth,
      // Do NOT set Content-Type here — browser/Node will set it with boundary
    },
    body: formData,
  });

  const body = await res.json();
  if (!res.ok) {
    const msg = (body as { message?: string })?.message ?? JSON.stringify(body);
    throw new Error(`WP media upload failed (${res.status}): ${msg}`);
  }

  const mediaBody = body as {
    id: number;
    source_url?: string;
    guid?: { rendered?: string };
    slug: string;
  };

  // Optionally set alt text via PATCH (WP multipart upload doesn't accept alt)
  if (altText && mediaBody.id) {
    await patchMediaAltText(creds.baseUrl, auth, mediaBody.id, altText).catch(
      () => {
        // Non-fatal — media is uploaded, alt text is best-effort
      }
    );
  }

  return {
    id: mediaBody.id,
    url: (mediaBody.source_url ?? mediaBody.guid?.rendered ?? "") as string,
    slug: mediaBody.slug,
    altText: altText ?? "",
  };
}

async function patchMediaAltText(
  baseUrl: string,
  auth: string,
  mediaId: number,
  altText: string
): Promise<void> {
  await fetch(`${baseUrl}/wp-json/wp/v2/media/${mediaId}`, {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ alt_text: altText }),
  });
}

/** Sanitise filename for the multipart form field. */
function encodeFilename(filename: string): string {
  return filename.replace(/[^\w.\-]/g, "_");
}
