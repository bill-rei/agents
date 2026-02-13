# Web Renderer

The Web Renderer (`web-renderer/`) is a dedicated agent that converts structured web copy into clean, semantic HTML for WordPress publishing.

## Why render HTML upstream?

The Website Messaging Architect (WMA) and Editor agents output structured copy using markdown-style conventions:

```
### Section 1: Hero
**H1:** Welcome to Best Life
**Subhead:** Your wellness journey starts here

**Body Copy:**
Discover the tools and community you need.

• Expert wellness guidance
• Science-backed longevity tips
```

The Publisher's `marked`-based fallback converts this to HTML, but the output is messy — `marked` doesn't understand `**H1:**` labels, `•` bullets, or section structure. The result is inconsistent HTML that doesn't render well in Elementor.

The WebRenderer solves this by using an LLM to intelligently interpret the structured format and produce clean, semantic HTML. The Publisher then passes it through untouched.

**Pipeline**: WMA/Editor → **WebRenderer** → Publisher

## Formatting rules

The WebRenderer enforces these rules (non-negotiable):

1. Exactly one `<h1>` element per page
2. Section titles → `<h2>` elements
3. Sub-sections → `<h3>` elements
4. All bullet lists → `<ul><li>` structures
5. Body copy → `<p>` tags
6. Bold labels → `<strong>`
7. Content grouped in `<section>` elements
8. No inline CSS, class attributes, or scripts
9. No `<html>/<head>/<body>` wrapper — content fragment only
10. Semantic elements only: `<section>`, `<h1>`-`<h3>`, `<p>`, `<ul>`, `<li>`, `<strong>`, `<em>`, `<blockquote>`

## API

**Endpoint**: `POST /api/compile`

**Request body** (JSON):

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `rawCopy` | string | Yes | Structured copy from WMA or Editor |
| `pageName` | string | No | Page name for context (e.g., "Homepage") |
| `constraints` | string[] | No | Rendering constraints (e.g., "No medical claims") |
| `renderProfile` | string | No | Profile name for brand-specific conventions |

**Response**:

```json
{
  "artifact_type": "web_page",
  "content_format": "html",
  "content": {
    "title": "Extracted from <h1>",
    "html": "<h1>...</h1><section>...</section>"
  }
}
```

## content_format field

The `content_format` field is a top-level artifact field (not inside `content`). Valid values:

| Value | Meaning |
|-------|---------|
| `"html"` | Content is clean HTML — Publisher passes through without conversion |
| `"markdown"` | Content is markdown — Publisher converts via fallback |
| `"text"` | Content is plain text — Publisher wraps in `<p>` tags |

When the Publisher receives a web_page artifact:
- `content_format: "html"` → **passthrough** (no conversion)
- Missing or other value → **fallback** conversion with warning log

## Running the renderer

### Start the agent

```bash
npm run start:renderer
# → http://localhost:3007
```

### Web UI

Open `http://localhost:3007` in your browser. Paste WMA/Editor output, set the page name, and click "Render HTML". Toggle between source view and rendered preview.

### API via curl

```bash
curl -s http://localhost:3007/api/compile \
  -H "Content-Type: application/json" \
  -d '{
    "rawCopy": "### Section 1: Hero\n**H1:** Welcome to Best Life\n**Subhead:** Your wellness journey starts here\n\n**Body Copy:**\nDiscover tools for living well.\n\n• Expert guidance\n• Science-backed tips",
    "pageName": "Homepage"
  }' | jq .
```

## End-to-end pipeline

### Manual flow

1. Run WMA or Editor to produce structured copy
2. Paste output into WebRenderer (UI or API)
3. Save the rendered artifact JSON
4. Publish via CLI:

```bash
# Dry-run with rendered artifact
node scripts/publish.js \
  --file rendered-artifact.json \
  --site bestlife-staging --page homepage --dry-run

# Should show: [html] content_format is html; skipping conversion
```

### Quick dry-run with example

```bash
# Publish the pre-rendered example (has content_format: "html")
node scripts/publish.js \
  --file examples/artifacts/web/bestlife-homepage-rendered.json \
  --site bestlife-staging --page homepage --dry-run

# Compare with markdown example (fallback conversion)
npm run publish:dry
```

## Sample artifact (before/after)

### Before (WMA/Editor output)

```
### Section 1: Hero
**H1:** Best Life – Live Your Best Life Every Day
**Subhead:** Your wellness journey starts here

**Body Copy:**
Your journey to wellness, longevity, and fulfillment starts here.

### Section 2: What We Offer
**Header:** What We Offer

• Expert wellness guidance
• Science-backed longevity tips
• Community support and events
```

### After (WebRenderer output)

```html
<h1>Best Life – Live Your Best Life Every Day</h1>
<section>
  <h2>Hero</h2>
  <p><strong>Your wellness journey starts here</strong></p>
  <p>Your journey to wellness, longevity, and fulfillment starts here.</p>
</section>
<section>
  <h2>What We Offer</h2>
  <ul>
    <li>Expert wellness guidance</li>
    <li>Science-backed longevity tips</li>
    <li>Community support and events</li>
  </ul>
</section>
```

## Expected artifact fields

A complete rendered artifact includes:

```json
{
  "artifact_id": "unique-id",
  "brand": "bestlife",
  "artifact_type": "web_page",
  "content_format": "html",
  "target": {
    "platform": "wordpress",
    "site_key": "bestlife-staging",
    "slug": "bestlife-homepage-agent-draft"
  },
  "content": {
    "title": "Page Title (extracted from <h1>)",
    "html": "<h1>...</h1><section>...</section>"
  },
  "status": "draft",
  "provenance": {
    "agent": "web-renderer",
    "created_at": "ISO timestamp"
  }
}
```
