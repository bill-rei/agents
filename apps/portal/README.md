# Marketing Ops Portal

## Design-Locked Publishing

Agents output structured JSON conforming to a design contract. The portal validates the contract, selects the correct Elementor template, and publishes to WordPress with structured fields (ACF or meta fallback).

### How it works

1. Agent produces a structured JSON artifact (the "design contract")
2. Portal validates against schema (Zod) — blocks publish on failure
3. Template registry maps `(brand, campaign_type)` → Elementor template ID
4. Portal creates/updates a WP page by slug, assigns the template, and writes structured fields
5. If ACF is available, fields are written via ACF REST API; otherwise via WP meta + fallback HTML

### Supported brands

| Brand | Env prefix | WordPress target |
|-------|-----------|-----------------|
| `llif` | `LLIF_WP_*` | LLIF.org |
| `bestlife` | `BLA_WP_*` | BestLife.app |

### Campaign types

`use_case`, `feature`, `thematic`, `release`, `program`

### API endpoint

```
POST /api/publish/designLocked
```

#### Request body

```json
{
  "slug": "my-campaign-page",
  "title": "My Campaign Page",
  "status": "draft",
  "artifact": {
    "meta": {
      "brand": "llif",
      "campaign_type": "use_case",
      "version": "1.0.0",
      "last_updated": "2026-02-18"
    },
    "hero": {
      "title": "Unlock Your Potential",
      "subtitle": "A new way to work",
      "eyebrow": "NEW"
    },
    "tldr": {
      "summary": "This campaign highlights the key use case for enterprise teams."
    },
    "sections": [
      {
        "heading": "Why This Matters",
        "body": "Teams need better tools to collaborate effectively across distributed environments.",
        "bullets": ["Faster onboarding", "Better retention", "Lower costs"]
      }
    ],
    "privacy_block": {
      "enabled": true,
      "text": "We collect minimal data and never share it with third parties."
    },
    "cta": {
      "headline": "Ready to get started?",
      "button_text": "Start Free Trial",
      "button_url": "https://example.com/trial"
    }
  }
}
```

#### Sample curl

```bash
curl -X POST http://localhost:4000/api/publish/designLocked \
  -H "Content-Type: application/json" \
  -H "Cookie: token=YOUR_SESSION_TOKEN" \
  -d '{
    "slug": "q1-use-case",
    "artifact": {
      "meta": { "brand": "llif", "campaign_type": "use_case", "version": "1.0.0", "last_updated": "2026-02-18" },
      "hero": { "title": "Unlock Your Potential" },
      "tldr": { "summary": "Key use case for enterprise teams." },
      "sections": [{ "heading": "Why", "body": "Teams need better tools.", "bullets": ["Speed", "Quality"] }],
      "privacy_block": { "enabled": true, "text": "We respect your privacy." },
      "cta": { "headline": "Get Started", "button_text": "Try Now", "button_url": "https://example.com/start" }
    }
  }'
```

#### Response

```json
{
  "ok": true,
  "brand": "llif",
  "campaign_type": "use_case",
  "pageId": 456,
  "url": "https://llif.org/q1-use-case/",
  "usedAcf": true,
  "templateId": 1111
}
```

### Validation rules

- Hero title is the sole H1 — no `<h1>` tags allowed elsewhere
- Max 6 sections
- Each section body ≤ 120 words
- No inline styles, script tags, or event handlers
- LLIF brand requires `privacy_block.enabled = true` with text
- `last_updated` must be `YYYY-MM-DD`
- CTA `button_url` must be HTTPS
- `campaign_type` must be in the template registry for the brand

### Backward compatibility

Existing pipeline using `content_format="html"` or `"markdown"` continues to work unchanged. Set `content_format="structured"` in artifact metadata to route through design-locked publishing.

### Running tests

```bash
cd apps/portal
npx tsx --test __tests__/designContract.test.ts __tests__/templateRegistry.test.ts
```
