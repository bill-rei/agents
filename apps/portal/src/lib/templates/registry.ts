import type { CampaignType } from "@/lib/designContract/schema";
import { BRAND_KEYS } from "@/config/brand";

/**
 * Maps (brandKey, campaign_type) → Elementor template ID.
 *
 * Template IDs are deployment-specific placeholders. Replace with real
 * Elementor template IDs once created in WordPress.
 *
 * To add templates for a new brand: extend BRAND_TEMPLATE_SEEDS below
 * using the brandKey from the registry, then restart the server.
 * No code changes elsewhere are needed.
 */

type TemplateMap = Record<CampaignType, number>;

// Seed IDs per brand (offset by 1000 per brand slot to avoid collisions).
const BRAND_TEMPLATE_SEEDS: Record<string, TemplateMap> = {
  mycoachbill: {
    use_case: 1001,
    thematic: 1002,
    release: 1003,
    feature: 1004,
    program: 1005,
  },
};

// Build the full registry, auto-generating placeholder IDs for any registered
// brand that doesn't have explicit seeds yet.
function buildRegistry(): Record<string, TemplateMap> {
  const registry: Record<string, TemplateMap> = {};
  const campaignTypes: CampaignType[] = ["use_case", "thematic", "release", "feature", "program"];

  BRAND_KEYS.forEach((brandKey, brandIndex) => {
    const seeds = BRAND_TEMPLATE_SEEDS[brandKey];
    if (seeds) {
      registry[brandKey] = seeds;
    } else {
      // Auto-generate numeric placeholders for unknown brands
      const base = (brandIndex + 10) * 1000;
      const autoMap = {} as TemplateMap;
      campaignTypes.forEach((ct, i) => {
        autoMap[ct] = base + i + 1;
      });
      registry[brandKey] = autoMap;
    }
  });

  return registry;
}

const TEMPLATE_REGISTRY = buildRegistry();

const ALLOWED_CAMPAIGN_TYPES: CampaignType[] = [
  "use_case",
  "feature",
  "thematic",
  "release",
  "program",
];

export function getTemplateId(brand: string, campaignType: CampaignType): number {
  if (!ALLOWED_CAMPAIGN_TYPES.includes(campaignType)) {
    throw new Error(
      `Campaign type "${campaignType}" is not allowed. Allowed: ${ALLOWED_CAMPAIGN_TYPES.join(", ")}`
    );
  }

  const id = TEMPLATE_REGISTRY[brand]?.[campaignType];
  if (!id) {
    throw new Error(
      `No template registered for brand="${brand}", campaign_type="${campaignType}"`
    );
  }
  return id;
}

export function listTemplates(): Array<{ brand: string; campaignType: CampaignType; templateId: number }> {
  const result: Array<{ brand: string; campaignType: CampaignType; templateId: number }> = [];
  for (const [brand, types] of Object.entries(TEMPLATE_REGISTRY)) {
    for (const [ct, tid] of Object.entries(types)) {
      result.push({ brand, campaignType: ct as CampaignType, templateId: tid });
    }
  }
  return result;
}

export function isAllowedCampaignType(campaignType: string): boolean {
  return ALLOWED_CAMPAIGN_TYPES.includes(campaignType as CampaignType);
}
