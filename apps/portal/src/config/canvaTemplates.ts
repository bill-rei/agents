/**
 * config/canvaTemplates.ts — Curated Canva Brand Template registry
 *
 * templateId values are Canva Brand Template IDs.
 * Replace the placeholder values with real IDs after creating the templates
 * in the Canva Brand Kit dashboard.
 *
 * fieldKeys maps our canonical field names → the exact data field names
 * configured inside the Canva template. Update these when the templates
 * are finalised in Canva.
 */

export type Brand = "llif" | "bestlife";

export interface CanvaTemplateField {
  /** Canonical input name used by the export API */
  key: "headline" | "subhead" | "cta" | "url" | "version" | "disclaimer";
  /** Human-readable label for the UI form */
  label: string;
  required: boolean;
  maxLength?: number;
}

export interface CanvaTemplate {
  /** Unique key used in API requests — never changes */
  key: string;
  brand: Brand;
  name: string;
  /** Short display description of the canvas format */
  format: string;
  /** Canva Brand Template ID — TBD; replace with real ID */
  templateId: string;
  /**
   * Mapping: canonical field key → Canva template data field name.
   * The Canva autofill API requires the exact field names used inside the template.
   */
  fieldKeys: Record<string, string>;
  /** Which fields are exposed in the UI form for this template */
  fields: CanvaTemplateField[];
}

const STANDARD_FIELDS: CanvaTemplateField[] = [
  { key: "headline", label: "Headline", required: true, maxLength: 80 },
  { key: "subhead", label: "Subhead", required: false, maxLength: 120 },
  { key: "cta", label: "Call to Action", required: false, maxLength: 40 },
  { key: "url", label: "URL", required: false, maxLength: 120 },
  { key: "version", label: "Version / Date", required: false, maxLength: 20 },
  { key: "disclaimer", label: "Disclaimer", required: false, maxLength: 200 },
];

export const CANVA_TEMPLATES: CanvaTemplate[] = [
  {
    key: "llif_li_square",
    brand: "llif",
    name: "LLIF – LinkedIn Square Post",
    format: "1080 × 1080 px",
    templateId: "TBD_LLIF_LI_SQUARE",
    fieldKeys: {
      headline: "headline",
      subhead: "subhead",
      cta: "cta",
      url: "url",
      version: "version",
      disclaimer: "disclaimer",
    },
    fields: STANDARD_FIELDS,
  },
  {
    key: "llif_li_banner",
    brand: "llif",
    name: "LLIF – LinkedIn Banner",
    format: "1584 × 396 px",
    templateId: "TBD_LLIF_LI_BANNER",
    fieldKeys: {
      headline: "headline",
      subhead: "subhead",
      cta: "cta",
      url: "url",
      version: "version",
      disclaimer: "disclaimer",
    },
    fields: STANDARD_FIELDS,
  },
  {
    key: "bla_li_square",
    brand: "bestlife",
    name: "Best Life – LinkedIn Square Post",
    format: "1080 × 1080 px",
    templateId: "TBD_BLA_LI_SQUARE",
    fieldKeys: {
      headline: "headline",
      subhead: "subhead",
      cta: "cta",
      url: "url",
      version: "version",
      disclaimer: "disclaimer",
    },
    fields: STANDARD_FIELDS,
  },
  {
    key: "bla_x_image",
    brand: "bestlife",
    name: "Best Life – X / Twitter Image",
    format: "1600 × 900 px",
    templateId: "TBD_BLA_X_IMAGE",
    fieldKeys: {
      headline: "headline",
      subhead: "subhead",
      cta: "cta",
      url: "url",
      version: "version",
      disclaimer: "disclaimer",
    },
    fields: STANDARD_FIELDS,
  },
];

/** Look up a template by key. Returns undefined if not found. */
export function getTemplate(key: string): CanvaTemplate | undefined {
  return CANVA_TEMPLATES.find((t) => t.key === key);
}

/** Filter templates by brand. */
export function getTemplatesForBrand(brand: Brand): CanvaTemplate[] {
  return CANVA_TEMPLATES.filter((t) => t.brand === brand);
}

/** Client-safe subset (strips templateId and fieldKeys). */
export interface CanvaTemplateClient {
  key: string;
  brand: Brand;
  name: string;
  format: string;
  fields: CanvaTemplateField[];
}

export function toClientTemplate(t: CanvaTemplate): CanvaTemplateClient {
  return { key: t.key, brand: t.brand, name: t.name, format: t.format, fields: t.fields };
}
