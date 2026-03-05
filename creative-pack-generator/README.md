# Creative Pack Generator

Generates a complete social creative pack from an approved campaign — platform-sized images, copy variants for LinkedIn & X, and a Canva upload bundle.

## Dependencies

Requires Brand Asset Compiler to have run first (for the logo PNG).
If the logo is missing, this agent auto-invokes Brand Asset Compiler before continuing.

## Inputs

### Full mode (all fields in request body)
```json
{
  "brandKey": "LLIF",
  "campaignTitle": "Health is Personal, Not Prescribed",
  "campaignSlug": "health-is-personal-not-prescribed",
  "keyMessage": "Health is a pattern, not a point.",
  "cta": "Start tracking what matters.",
  "force": false
}
```

### Minimal mode (loads from campaign.json on disk)
```json
{
  "brandKey": "LLIF",
  "campaignSlug": "health-is-personal-not-prescribed"
}
```

Reads from: `marketing-ops-shared-content/campaigns/{YYYY-MM}/{brandKey}/{slug}/campaign.json`

### campaign.json format
```json
{
  "title": "Health is Personal, Not Prescribed",
  "slug": "health-is-personal-not-prescribed",
  "keyMessage": "Health is a pattern, not a point.",
  "cta": "Start tracking what matters.",
  "brandKey": "LLIF",
  "month": "2026-03"
}
```

## Output structure

```
marketing-ops-shared-content/campaigns/{YYYY-MM}/{brandKey}/{slug}/creative-pack/
├── images/
│   ├── instagram-square-1080x1080.png
│   ├── instagram-portrait-1080x1350.png
│   ├── story-1080x1920.png
│   ├── linkedin-image-1200x627.png
│   ├── x-image-1600x900.png
│   ├── threads-1440x1920.png
│   └── youtube-thumbnail-1280x720.png
├── copy/
│   ├── linkedin-llif.md      (3 variants)
│   ├── linkedin-bestlife.md  (3 variants)
│   ├── x-llif.md             (5 variants)
│   └── x-bestlife.md         (5 variants)
├── canva-bundle/
│   └── bundle.zip            (images/ + copy/ + brand/ + manifest.json)
├── manifest.json
└── build-report.json
```

## Running

### Express server (port 3010)

```bash
npm run start:creative-pack-generator

# Health check
curl http://localhost:3010/health

# Full mode
curl -s -X POST http://localhost:3010/api/compile \
  -H "Content-Type: application/json" \
  -d '{
    "brandKey": "LLIF",
    "campaignTitle": "Health is Personal, Not Prescribed",
    "campaignSlug": "health-is-personal-not-prescribed",
    "keyMessage": "Health is a pattern, not a point.",
    "cta": "Start tracking what matters."
  }' | jq .

# Minimal mode (campaign.json must exist on disk)
curl -s -X POST http://localhost:3010/api/compile \
  -H "Content-Type: application/json" \
  -d '{"brandKey":"LLIF","campaignSlug":"health-is-personal-not-prescribed"}' | jq .

# Force overwrite
curl -s -X POST http://localhost:3010/api/compile \
  -H "Content-Type: application/json" \
  -d '{"brandKey":"BestLife","campaignSlug":"my-campaign","force":true}' | jq .
```

### Portal API

```bash
curl -s -X POST http://localhost:4000/api/agents/creative-pack-generator \
  -H "Content-Type: application/json" \
  -b "your-next-auth-session-cookie" \
  -d '{
    "brandKey": "LLIF",
    "campaignSlug": "health-is-personal-not-prescribed",
    "campaignTitle": "Health is Personal, Not Prescribed",
    "keyMessage": "Health is a pattern, not a point.",
    "cta": "Start tracking what matters."
  }' | jq .
```

### Portal UI

Navigate to **http://localhost:4000/creative-tools**

## Verify generated files

```bash
# Check image dimensions using ImageMagick (optional)
identify marketing-ops-shared-content/campaigns/2026-03/LLIF/health-is-personal-not-prescribed/creative-pack/images/*.png

# Or with Node
node -e "
  const sharp = require('sharp');
  const fs = require('fs');
  const dir = 'marketing-ops-shared-content/campaigns/2026-03/LLIF/health-is-personal-not-prescribed/creative-pack/images';
  Promise.all(fs.readdirSync(dir).map(f => sharp(dir+'/'+f).metadata().then(m => console.log(f, m.width+'x'+m.height))));
"
```

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SHARED_CONTENT_PATH` | `../../marketing-ops-shared-content` | Path to shared-content repo |
| `CREATIVE_PACK_PORT` | `3010` | Agent server port |
| `ANTHROPIC_API_KEY` | — | Required for real copy generation |
| `LLM_PROVIDER` | `anthropic` | Override LLM provider (anthropic/openai/grok) |

## Copy generation

Copy variants are generated via the shared `lib/llm.js` multi-provider LLM utility.
If no API key is set, placeholder copy is written instead (with a warning).

Copy adapts to each brand's voice:
- **LLIF**: research-informed, empowering, privacy-forward
- **BestLife**: accessible, encouraging, wellness-coach tone

No medical claims, treatment advice, or diagnostic language is generated.

## Image rendering

Images use an SVG overlay approach:
1. SVG template built per size (background + text + logo embedding)
2. Rendered to PNG via `@resvg/resvg-js` (system fonts loaded automatically)
3. Dimension-verified via `sharp`

Text font stack: `Liberation Sans, DejaVu Sans, Noto Sans, Arial, sans-serif`
(available on most Linux/macOS/Windows systems)

## Files

| File | Purpose |
|------|---------|
| `sizes.js` | All image sizes + copy specs |
| `templates.js` | SVG template builder (text + logo placement) |
| `copy-generator.js` | LLM-based copy variant generation |
| `index.js` | Core orchestration (images + copy + zip + report) |
| `server.js` | Express HTTP wrapper on port 3010 |
