import type { Brand, CampaignType } from "@/lib/designContract/schema";

/**
 * Maps (brand, campaign_type) → Elementor template ID.
 *
 * Placeholder IDs — replace with real Elementor template IDs once created in WP.
 * LLIF templates: 1111–1115, BestLife templates: 2221–2225.
 */
const TEMPLATE_REGISTRY: Record<Brand, Record<CampaignType, number>> = {
  llif: {
    use_case: 1111,
    thematic: 1112,
    release: 1113,
    feature: 1114,
    program: 1115,
  },
  bestlife: {
    use_case: 2221,
    feature: 2222,
    thematic: 2223,
    release: 2224,
    program: 2225,
  },
};

/** Allowed campaign types per brand (all brands support all types for now). */
const ALLOWED_CAMPAIGN_TYPES: Record<Brand, CampaignType[]> = {
  llif: ["use_case", "feature", "thematic", "release", "program"],
  bestlife: ["use_case", "feature", "thematic", "release", "program"],
};

export function getTemplateId(brand: Brand, campaignType: CampaignType): number {
  const allowed = ALLOWED_CAMPAIGN_TYPES[brand];
  if (!allowed || !allowed.includes(campaignType)) {
    throw new Error(
      `Campaign type "${campaignType}" is not allowed for brand "${brand}". ` +
      `Allowed: ${allowed?.join(", ") || "none"}`
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

export function listTemplates(): Array<{ brand: Brand; campaignType: CampaignType; templateId: number }> {
  const result: Array<{ brand: Brand; campaignType: CampaignType; templateId: number }> = [];
  for (const [brand, types] of Object.entries(TEMPLATE_REGISTRY)) {
    for (const [ct, tid] of Object.entries(types)) {
      result.push({ brand: brand as Brand, campaignType: ct as CampaignType, templateId: tid });
    }
  }
  return result;
}

export function isAllowedCampaignType(brand: Brand, campaignType: string): boolean {
  const allowed = ALLOWED_CAMPAIGN_TYPES[brand];
  return allowed ? allowed.includes(campaignType as CampaignType) : false;
}
