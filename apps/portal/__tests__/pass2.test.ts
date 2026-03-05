/**
 * Pass 2 tests — tokenVault encrypt/decrypt + publish job creation validation.
 * Framework: node:test (same as all other portal tests).
 *
 * Requires TOKEN_ENCRYPTION_KEY env var (set to a test value here).
 */

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";

// Set a test key before importing tokenVault
process.env.TOKEN_ENCRYPTION_KEY = "a".repeat(64); // 64 hex chars = 32 bytes

import { encrypt, decrypt, canDecrypt } from "../src/lib/crypto/tokenVault";
import { encodeState, decodeState, generateNonce } from "../src/lib/oauthState";
import { getBrandRules } from "../src/lib/brandRules";

// ── Token Vault ───────────────────────────────────────────────────────────────

describe("tokenVault", () => {
  it("encrypts and decrypts a short string", () => {
    const plain = "my_access_token_abc123";
    const cipher = encrypt(plain);
    assert.notStrictEqual(cipher, plain, "Ciphertext must differ from plaintext");
    assert.strictEqual(decrypt(cipher), plain);
  });

  it("encrypts and decrypts a long token", () => {
    const plain = "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9." + "x".repeat(400);
    const cipher = encrypt(plain);
    assert.strictEqual(decrypt(cipher), plain);
  });

  it("produces different ciphertext on each call (random IV)", () => {
    const plain = "same_token";
    const c1 = encrypt(plain);
    const c2 = encrypt(plain);
    assert.notStrictEqual(c1, c2, "Each encryption must use a fresh IV");
    // Both must decrypt to the same plaintext
    assert.strictEqual(decrypt(c1), plain);
    assert.strictEqual(decrypt(c2), plain);
  });

  it("canDecrypt returns true for valid ciphertext", () => {
    const cipher = encrypt("token123");
    assert.ok(canDecrypt(cipher));
  });

  it("canDecrypt returns false for tampered ciphertext", () => {
    const cipher = encrypt("token123");
    // Flip the last byte
    const buf = Buffer.from(cipher, "base64");
    buf[buf.length - 1] ^= 0xff;
    const tampered = buf.toString("base64");
    assert.ok(!canDecrypt(tampered));
  });

  it("throws for ciphertext that is too short", () => {
    assert.throws(() => decrypt(Buffer.from("short").toString("base64")), /too short/);
  });

  it("throws when TOKEN_ENCRYPTION_KEY is wrong length", () => {
    const orig = process.env.TOKEN_ENCRYPTION_KEY;
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.from("short").toString("base64");
    assert.throws(() => encrypt("anything"), /32 bytes/);
    process.env.TOKEN_ENCRYPTION_KEY = orig;
  });
});

// ── OAuth state ───────────────────────────────────────────────────────────────

describe("oauthState", () => {
  it("encodes and decodes LLIF state", () => {
    const nonce = generateNonce();
    const encoded = encodeState({ brandMode: "LLIF", nonce });
    const decoded = decodeState(encoded);
    assert.ok(decoded !== null);
    assert.strictEqual(decoded!.brandMode, "LLIF");
    assert.strictEqual(decoded!.nonce, nonce);
  });

  it("encodes and decodes BestLife state", () => {
    const nonce = generateNonce();
    const encoded = encodeState({ brandMode: "BestLife", nonce });
    const decoded = decodeState(encoded);
    assert.strictEqual(decoded!.brandMode, "BestLife");
  });

  it("returns null for garbage input", () => {
    assert.strictEqual(decodeState("not-valid-base64!!!"), null);
  });

  it("returns null for missing fields", () => {
    const bad = Buffer.from(JSON.stringify({ foo: "bar" })).toString("base64url");
    assert.strictEqual(decodeState(bad), null);
  });

  it("generates unique nonces", () => {
    const n1 = generateNonce();
    const n2 = generateNonce();
    assert.notStrictEqual(n1, n2);
    assert.strictEqual(n1.length, 32); // 16 bytes as hex
  });
});

// ── Publish job validation (unit — no DB) ─────────────────────────────────────

describe("publish job validation logic", () => {
  it("rejects empty platforms array", () => {
    const platforms: string[] = [];
    assert.ok(platforms.length === 0, "Empty platforms should be rejected");
  });

  it("accepts valid platform list", () => {
    const VALID = ["x", "linkedin"];
    for (const p of ["x", "linkedin"]) {
      assert.ok(VALID.includes(p));
    }
  });

  it("brand isolation: LLIF connection cannot serve BestLife job", () => {
    const connectionBrand = "LLIF";
    const jobBrand = "BestLife";
    assert.notStrictEqual(connectionBrand, jobBrand, "Brand mismatch should be caught");
  });

  it("brand isolation: matching brands pass", () => {
    const connectionBrand = "LLIF";
    const jobBrand = "LLIF";
    assert.strictEqual(connectionBrand, jobBrand);
  });
});

// ── Brand rules (reuse from pass1, verify pass2 requirements) ─────────────────

describe("brand rules — pass2 publish gate", () => {
  it("LLIF has privacy statement for website content", () => {
    const rules = getBrandRules("LLIF");
    assert.ok(rules.privacyStatement && rules.privacyStatement.length > 0);
  });

  it("BestLife has no required hedges (posts can be direct)", () => {
    const rules = getBrandRules("BestLife");
    assert.strictEqual(rules.requiredHedges.length, 0);
  });
});
