import { DesignContractSchema, type DesignContract } from "./schema";
import { auditContract } from "./sanitize";

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  data?: DesignContract;
}

/** Word count helper — splits on whitespace. */
function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Validate a structured artifact against the design contract.
 * Returns { ok, errors, data } — data is the parsed+validated object when ok=true.
 */
export function validateDesignContract(input: unknown): ValidationResult {
  const errors: string[] = [];

  // 1. Zod schema parse
  const parsed = DesignContractSchema.safeParse(input);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      errors.push(`${issue.path.join(".")}: ${issue.message}`);
    }
    return { ok: false, errors };
  }

  const data = parsed.data;

  // 2. No H1 tags in body fields (hero.title is the sole H1)
  const bodyFields = [
    ...data.sections.map((s, i) => ({ val: s.body, path: `sections[${i}].body` })),
    ...data.sections.flatMap((s, i) =>
      (s.bullets || []).map((b, j) => ({ val: b, path: `sections[${i}].bullets[${j}]` }))
    ),
    { val: data.tldr.summary, path: "tldr.summary" },
    { val: data.cta.headline, path: "cta.headline" },
    ...(data.hero.subtitle ? [{ val: data.hero.subtitle, path: "hero.subtitle" }] : []),
    ...(data.hero.eyebrow ? [{ val: data.hero.eyebrow, path: "hero.eyebrow" }] : []),
    ...(data.privacy_block?.text ? [{ val: data.privacy_block.text, path: "privacy_block.text" }] : []),
  ];

  for (const { val, path } of bodyFields) {
    if (/<h1[\s>]/i.test(val)) {
      errors.push(`${path}: Must not contain <h1> tags (hero.title is the sole H1)`);
    }
  }

  // 3. Section body word count <= 120
  for (let i = 0; i < data.sections.length; i++) {
    const wc = wordCount(data.sections[i].body);
    if (wc > 120) {
      errors.push(`sections[${i}].body: ${wc} words exceeds 120-word limit`);
    }
  }

  // 4. LLIF requires privacy_block.enabled = true with text
  if (data.meta.brand === "llif") {
    if (!data.privacy_block || !data.privacy_block.enabled) {
      errors.push("privacy_block.enabled must be true for brand 'llif'");
    } else if (!data.privacy_block.text || data.privacy_block.text.trim().length === 0) {
      errors.push("privacy_block.text is required when brand is 'llif'");
    }
  }

  // 5. Sanitization audit — no inline styles, scripts, event handlers
  const sanitizeIssues = auditContract(data);
  errors.push(...sanitizeIssues);

  return {
    ok: errors.length === 0,
    errors,
    data: errors.length === 0 ? data : undefined,
  };
}
