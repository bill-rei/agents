import type { BrandConfig } from "./schema";

// ── Brand pack definitions ────────────────────────────────────────────────────
// Add new brands here. Each entry is the canonical brand config for that key.
// Credential-bearing env vars stay in .env; only metadata lives here.

const mycoachbill: BrandConfig = {
  brandKey: "mycoachbill",
  displayName: "MyCoachBill",
  legalName: "MyCoachBill Inc.",
  primaryDomain: "mycoachbill.com",
  supportEmail: "support@mycoachbill.com",
  logo: {
    light: "/brand/mycoachbill/logo-dark.svg",
    dark: "/brand/mycoachbill/logo-light.svg",
  },
  theme: {
    primaryColor: "#4F46E5",   // indigo-600
    accentColor: "#7C3AED",    // violet-600
  },
  socialDefaults: {
    xHandle: "mycoachbill",
    linkedinOrg: "mycoachbill",
    defaultHashtags: ["mycoachbill"],
  },
  publishTargets: {
    githubRepo: "",
    wpStagingUrl: "",
    extras: {},
  },
  contentGuardrails: {
    privacyLanguageRequired: true,
    approvalRequired: true,
    maxPhase: 2,
    prohibitedTerms: ["optimize", "coach", "clinically proven"],
  },
};

// ── Brand registry ─────────────────────────────────────────────────────────────

/** All registered brands, keyed by brandKey. */
export const BRAND_REGISTRY: Record<string, BrandConfig> = {
  mycoachbill,
};

/** Ordered list of brand keys. First entry is used as the default fallback. */
export const BRAND_KEYS = Object.keys(BRAND_REGISTRY) as string[];

/** The hard-coded fallback when no other resolution succeeds. */
export const FALLBACK_BRAND_KEY = "mycoachbill";
