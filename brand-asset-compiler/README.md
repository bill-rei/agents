# Brand Asset Compiler

Generates all brand assets from a single master SVG logo — favicons, social packs, Open Graph images, Next.js-ready files, and a Canva upload bundle.

## How it works

1. Reads `logo-master.svg` from the shared-content repo
2. Renders it to high-res PNG via `@resvg/resvg-js`
3. Composites/resizes via `sharp` to every required dimension
4. Writes outputs into the brand's folder in `marketing-ops-shared-content`
5. Packages a `bundle.zip` for Canva upload
6. Writes a `build-report.json` with checksums and timestamps

## Input

| Path | Required |
|------|----------|
| `marketing-ops-shared-content/brand/{brandKey}/source/logo-master.svg` | Yes |
| `marketing-ops-shared-content/brand/brand-manifest.json` | No (uses defaults) |

### brand-manifest.json format

```json
{
  "brands": {
    "LLIF": {
      "name": "Live Learn Innovate Foundation",
      "shortName": "LLIF",
      "tagline": "",
      "backgroundColor": "#ffffff",
      "themeColor": "#000000"
    },
    "BestLife": {
      "name": "Best Life",
      "shortName": "BestLife",
      "tagline": "",
      "backgroundColor": "#ffffff",
      "themeColor": "#000000"
    }
  }
}
```

## Output structure

```
marketing-ops-shared-content/brand/{brandKey}/
├── source/
│   └── logo-master.svg            ← input
├── favicon/
│   ├── favicon.svg
│   ├── favicon-32x32.png
│   ├── apple-touch-icon.png       (180×180, white bg)
│   ├── icon-192.png               (transparent)
│   ├── icon-512.png               (transparent)
│   ├── site-icon-512.png          (512×512, white bg — WordPress)
│   └── manifest.webmanifest
├── social/
│   ├── og-default-1200x630.png
│   ├── profile-master-800.png
│   ├── x-banner-1500x500.png
│   ├── linkedin-cover-4200x700.png
│   ├── facebook-cover-851x315.png
│   └── youtube-banner-2560x1440.png
├── nextjs/
│   ├── metadata-snippet.md
│   └── icons/                     ← mirrors favicon/ for Next.js public/
├── canva-bundle/
│   ├── logos/
│   │   ├── logo-master.svg
│   │   ├── logo-2048.png
│   │   └── logo-1024.png
│   ├── favicon/                   ← mirrors favicon/
│   ├── social/                    ← mirrors social/
│   ├── manifest.json
│   └── bundle.zip
└── build-report.json
```

## Running

### CLI

```bash
# First run — generate everything
node scripts/brand-asset-compiler.js --brand LLIF

# BestLife
node scripts/brand-asset-compiler.js --brand BestLife

# Force-overwrite existing files
node scripts/brand-asset-compiler.js --brand LLIF --force

# npm shortcut
npm run brand-assets -- --brand LLIF --force
```

### Express server (port 3009)

```bash
# Start the agent
npm run start:brand-asset-compiler

# Health check
curl http://localhost:3009/health

# Run compilation
curl -s -X POST http://localhost:3009/api/compile \
  -H "Content-Type: application/json" \
  -d '{"brandKey":"LLIF","force":false}' | jq .

# Force overwrite
curl -s -X POST http://localhost:3009/api/compile \
  -H "Content-Type: application/json" \
  -d '{"brandKey":"BestLife","force":true}' | jq .
```

### Portal API (requires auth session)

```bash
curl -s -X POST http://localhost:4000/api/agents/brand-asset-compiler \
  -H "Content-Type: application/json" \
  -b "your-next-auth-session-cookie" \
  -d '{"brandKey":"LLIF","force":false}' | jq .
```

### Portal UI

Navigate to **http://localhost:4000/brand-tools** or click **Brand Asset Compiler** in the Agents page under the **Brand Tools** group.

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SHARED_CONTENT_PATH` | `../../marketing-ops-shared-content` | Absolute path to shared-content repo |
| `BRAND_ASSET_COMPILER_PORT` | `3009` | Agent server port |
| `AGENT_HOST` | `http://localhost` | Used by portal to reach the agent |

## Idempotency

- Files are **skipped** if they already exist (pass `force: true` to overwrite)
- `build-report.json` is **always** updated regardless of force flag
- Re-running is safe — only new/changed files are written

## SVG requirements

- Must have a `viewBox` attribute (warned if missing)
- No external `http://` references (warned if found)
- Artboard should be ≥ 16×16 px (warned if smaller)
- Transparent or white background both work fine

## Files

| File | Purpose |
|------|---------|
| `sizes.js` | Canonical map of all output files with dimensions |
| `index.js` | Core compilation logic (SVG→PNG, ZIP generation) |
| `server.js` | Express HTTP wrapper on port 3009 |
