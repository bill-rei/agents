/**
 * tokenVault.ts — AES-256-GCM symmetric encryption for platform tokens.
 *
 * Key source: TOKEN_ENCRYPTION_KEY env var
 *   - 64-char hex string  (32 bytes)  — preferred
 *   - 44-char base64 string (32 bytes) — also accepted
 *
 * Ciphertext format (base64-encoded):
 *   [ 12 bytes IV ][ N bytes ciphertext ][ 16 bytes GCM auth tag ]
 *
 * NEVER log the raw key or raw plaintext tokens.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

function getKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error("TOKEN_ENCRYPTION_KEY env var is not set");

  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }

  const buf = Buffer.from(raw, "base64");
  if (buf.length !== KEY_BYTES) {
    throw new Error(
      `TOKEN_ENCRYPTION_KEY must be 32 bytes (got ${buf.length}). ` +
        "Generate with: openssl rand -hex 32"
    );
  }
  return buf;
}

export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, encrypted, tag]).toString("base64");
}

export function decrypt(ciphertext: string): string {
  const key = getKey();
  const buf = Buffer.from(ciphertext, "base64");

  if (buf.length < IV_BYTES + TAG_BYTES) {
    throw new Error("Ciphertext too short — may be corrupt");
  }

  const iv = buf.subarray(0, IV_BYTES);
  const tag = buf.subarray(buf.length - TAG_BYTES);
  const encrypted = buf.subarray(IV_BYTES, buf.length - TAG_BYTES);

  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

/** Returns true if ciphertext decrypts successfully (for health checks). */
export function canDecrypt(ciphertext: string): boolean {
  try {
    decrypt(ciphertext);
    return true;
  } catch {
    return false;
  }
}
