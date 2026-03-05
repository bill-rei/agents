import type { UCSBrandMode } from "../ucs/schema";

export interface BrandRules {
  name: string;
  tone: string;
  avoidTerms: string[];
  requiredHedges: string[];
  hashtagStyle: "professional" | "trendy";
  maxHashtags: Record<"linkedin" | "x" | "instagram" | "tiktok", number>;
  privacyStatement?: string;
  ctaStyle: string;
  voiceNote: string;
}

export const BRAND_RULES: Record<UCSBrandMode, BrandRules> = {
  LLIF: {
    name: "LLIF",
    tone: "Research-informed, authoritative, privacy-forward",
    avoidTerms: [
      "cure",
      "guaranteed",
      "proven to",
      "will definitely",
      "100% effective",
      "miracle",
      "instant results",
    ],
    requiredHedges: [
      "research suggests",
      "data indicates",
      "studies show",
      "evidence points to",
      "may help",
      "research-backed",
    ],
    hashtagStyle: "professional",
    maxHashtags: { linkedin: 5, x: 2, instagram: 20, tiktok: 5 },
    privacyStatement:
      "Your data is yours. LLIF never shares personal information with third parties.",
    ctaStyle: "Learn more and take control of your health journey →",
    voiceNote:
      "Write with the authority of a researcher who cares about the reader. Cite mechanisms, not miracles.",
  },
  BestLife: {
    name: "BestLife",
    tone: "Accessible, warm, wellness-coach",
    avoidTerms: [
      "cure",
      "clinical trial",
      "FDA approved",
      "medical treatment",
      "diagnosis",
      "symptom",
      "pathology",
    ],
    requiredHedges: [],
    hashtagStyle: "trendy",
    maxHashtags: { linkedin: 3, x: 2, instagram: 25, tiktok: 8 },
    ctaStyle: "Start your wellness journey today! ✨",
    voiceNote:
      "Write like an encouraging friend who happens to know a lot about wellness. Keep it achievable and uplifting.",
  },
};

export function getBrandRules(brandMode: UCSBrandMode): BrandRules {
  return BRAND_RULES[brandMode];
}
