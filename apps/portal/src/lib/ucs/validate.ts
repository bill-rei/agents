import { UCSCanonical, UCSBrandMode } from "./schema";
import { getBrandRules } from "../brandRules";

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateUCS(canonical: UCSCanonical, brandMode: UCSBrandMode): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!canonical.hook?.trim()) errors.push("Hook is required.");
  if (!canonical.body?.trim()) errors.push("Body is required.");

  const rules = getBrandRules(brandMode);
  const combined = [canonical.hook, canonical.body, canonical.callToAction ?? ""]
    .join(" ")
    .toLowerCase();

  for (const term of rules.avoidTerms) {
    if (combined.includes(term.toLowerCase())) {
      warnings.push(`Avoid using "${term}" per ${brandMode} brand guidelines.`);
    }
  }

  if (brandMode === "LLIF" && canonical.body.length > 100) {
    const hasHedge = rules.requiredHedges.some((h) => combined.includes(h.toLowerCase()));
    if (!hasHedge) {
      warnings.push(
        `LLIF content should include a research hedge (e.g. "${rules.requiredHedges[0]}").`
      );
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}
