'use strict';

// Uses lib/llm.js (shared multi-provider LLM utility) to generate
// platform-specific copy variants for each brand.

const { compile } = require('../lib/llm');

// ── System prompts ────────────────────────────────────────────────────────────

const BRAND_VOICES = {
  LLIF: `You write for Live Learn Innovate Foundation (LLIF) — a health technology company helping
people reclaim agency over their wellbeing through personal data and evidence-based tools.
Voice: thoughtful, empowering, research-informed. Tone: warm but credible. Avoid medical claims.
Always include a subtle note of privacy/personal control — e.g. "your data, your insight."`,

  BestLife: `You write for BestLife — a consumer wellness brand helping everyday people make small,
sustainable health improvements. Voice: encouraging, accessible, optimistic. Tone: friendly coach.
Avoid clinical language and medical claims. Subtly reinforce that users are in control of their journey.`,
};

const PLATFORM_RULES = {
  linkedin: `LinkedIn audience: professionals, health-tech adjacent, research-minded. Posts can be
180–300 words. Start with a hook sentence. Use 1–3 relevant hashtags at the end. Professional but not stiff.
No excessive emoji. Include a clear CTA at the end.`,

  x: `X (Twitter) audience: curious, fast-scrolling, tech-forward. Posts must be ≤280 characters
including hashtags. Be punchy and direct. One key insight or question per post. 1–2 hashtags max.
CTA is optional but must fit in character limit if used.`,
};

function buildSystemPrompt(platform, brandKey) {
  return `You are a marketing copywriter.

BRAND VOICE:
${BRAND_VOICES[brandKey] || BRAND_VOICES.LLIF}

PLATFORM RULES:
${PLATFORM_RULES[platform] || PLATFORM_RULES.linkedin}

CRITICAL RULES:
- Never make medical diagnoses, treatment claims, or prescriptive health advice.
- Never imply the product cures or prevents any disease.
- Do not include placeholder text like [INSERT] or [YOUR LINK].
- Output clean markdown with variant sections exactly as specified.
- Each variant must be meaningfully different: different hook, angle, or tone.`;
}

function buildUserPrompt({ platform, brandKey, brandName, campaignTitle, keyMessage, cta, variantCount }) {
  const charLimit = platform === 'x' ? '≤280 characters' : '180–300 words';

  return `Generate ${variantCount} distinct ${platform.toUpperCase()} post variants for the following campaign.

Campaign: ${campaignTitle}
Key Message: ${keyMessage || '(none provided — infer from campaign title)'}
CTA: ${cta || '(none provided — create a natural one)'}
Brand: ${brandName}

Output format (strict — do not add other headings or commentary):

## Variant 1
[post body, ${charLimit}]

---

## Variant 2
[post body, ${charLimit}]

---

## Variant 3
[post body, ${charLimit}]${variantCount > 3 ? `

---

## Variant 4
[post body, ${charLimit}]

---

## Variant 5
[post body, ${charLimit}]` : ''}`;
}

// Placeholder copy used when no LLM credentials are set
function placeholderCopy({ platform, brandKey, brandName, campaignTitle, variantCount }) {
  const intro = `# ${platform.charAt(0).toUpperCase() + platform.slice(1)} Copy — ${brandName} — ${campaignTitle}

> ⚠️  Placeholder copy — set ANTHROPIC_API_KEY (or OPENAI_API_KEY) to generate real variants.

`;
  const variants = Array.from({ length: variantCount }, (_, i) => {
    const n = i + 1;
    return `## Variant ${n}\n\n[Placeholder variant ${n} for "${campaignTitle}" on ${platform} — ${brandKey}]`;
  });
  return intro + variants.join('\n\n---\n\n');
}

/**
 * Generate copy variants for a given platform + brand.
 *
 * @param {{ platform: string, brandKey: string, brandName: string, campaignTitle: string, keyMessage?: string, cta?: string, variantCount: number, provider?: string }} opts
 * @returns {Promise<string>} markdown string
 */
async function generateCopyVariants(opts) {
  const { platform, brandKey, brandName, campaignTitle, keyMessage, cta, variantCount, provider } = opts;

  // Check credentials exist before attempting
  const hasAnthropicKey = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  const hasOpenAIKey    = Boolean(process.env.OPENAI_API_KEY);
  const hasGrokKey      = Boolean(process.env.XAI_API_KEY);

  if (!hasAnthropicKey && !hasOpenAIKey && !hasGrokKey) {
    console.warn(`[copy-generator] No LLM credentials found — using placeholder copy for ${brandKey}/${platform}`);
    return placeholderCopy({ platform, brandKey, brandName, campaignTitle, variantCount });
  }

  const systemPrompt = buildSystemPrompt(platform, brandKey);
  const userMessage  = buildUserPrompt({ platform, brandKey, brandName, campaignTitle, keyMessage, cta, variantCount });

  const header = `# ${platform.charAt(0).toUpperCase() + platform.slice(1)} Copy — ${brandName} — ${campaignTitle}\n\n`;

  try {
    const result = await compile(userMessage, systemPrompt, { provider });
    return header + result;
  } catch (err) {
    console.error(`[copy-generator] LLM call failed for ${brandKey}/${platform}: ${err.message}`);
    return placeholderCopy({ platform, brandKey, brandName, campaignTitle, variantCount });
  }
}

module.exports = { generateCopyVariants };
