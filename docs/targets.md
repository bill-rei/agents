# Target Registry

The Target Registry maps human-friendly `(site_key, page_key)` pairs to WordPress slugs and page IDs, so artifacts and CLI commands don't need to hardcode URLs or slugs.

## Directory structure

```
targets/
├── llif-staging.json
└── bestlife-staging.json
```

Each JSON file represents one site and contains:

```json
{
  "site_key": "bestlife-staging",
  "label": "Best Life – Staging",
  "environment": "staging",
  "base_url_env": "WP_BESTLIFE_STAGING_URL",
  "aliases": {
    "home": "homepage",
    "index": "homepage"
  },
  "pages": {
    "homepage": { "slug": "bestlife-homepage-agent-draft", "title": "Homepage" },
    "about":    { "slug": "bestlife-about-agent-draft",    "title": "About Us" }
  }
}
```

| Field          | Purpose |
|----------------|---------|
| `site_key`     | Must match the filename. Used in artifacts and CLI flags. |
| `label`        | Human-readable label for logs and usage output. |
| `environment`  | Must be `"staging"` — the publisher refuses non-staging sites. |
| `base_url_env` | Name of the env var holding the WordPress base URL. |
| `aliases`      | Optional. Maps shorthand page keys to canonical keys (e.g. `"home"` → `"homepage"`). |
| `pages`        | Map of canonical `page_key` → `{ slug, page_id?, title? }`. |

### page_key vs slug

- **page_key** is the human-friendly name used in CLI flags and the portal UI (e.g. `homepage`, `about`).
- **slug** is the actual WordPress page slug in the CMS (e.g. `bestlife-homepage-agent-draft`).
- **aliases** provide backward-compatible shorthand (e.g. `--page home` resolves to `homepage` → slug `bestlife-homepage-agent-draft`).

The registry resolves: `alias → canonical page_key → slug`.

## Credentials

Credentials stay in `.env`, never in registry files:

```
WP_BESTLIFE_STAGING_URL=https://stg-e25ss3.elementor.cloud
WP_BESTLIFE_STAGING_USER=bot
WP_BESTLIFE_STAGING_APP_PASSWORD=xxxx
```

The registry's `base_url_env` tells the loader which env var to read.

## CLI usage

### Publish with registry overrides

```bash
# Dry-run: publish an artifact to a specific site + page
node scripts/publish.js --file artifact.json --site bestlife-staging --page homepage --dry-run

# Using an alias (resolves home → homepage)
node scripts/publish.js --file artifact.json --site bestlife-staging --page home --dry-run

# Apply (actually push to WP)
node scripts/publish.js --file artifact.json --site bestlife-staging --page about --apply
```

`--site` and `--page` inject `target.site_key` and `target.slug` into each artifact before validation and publishing. This means the artifact file itself doesn't need to contain these fields.

### Update page title

By default the publisher **skips** overwriting the WP page title to prevent accidental changes. Use `--update-title` to explicitly push the title:

```bash
node scripts/publish.js --file artifact.json --site bestlife-staging --page homepage --apply --update-title
```

### Use --site without --page

```bash
# Overrides site_key but keeps the slug from the artifact
node scripts/publish.js --file artifact.json --site bestlife-staging --dry-run
```

### List available sites and pages

```bash
node scripts/publish.js
# (prints usage with available sites and page keys)
```

### Quick dry-run with npm script

```bash
npm run publish:dry
```

Runs a dry-run publish of the example BestLife homepage markdown artifact against the staging registry.

## Programmatic API

```js
const {
  loadRegistry,
  normalizePageKey,
  resolvePageSlug,
  resolveBaseUrl,
  listSiteKeys,
  listPageKeys,
} = require("./lib/targetRegistry");

// Load a site's full registry
const reg = loadRegistry("bestlife-staging");
// => { site_key, label, environment, base_url_env, aliases, pages: { ... } }

// Normalize an alias to its canonical key
normalizePageKey("bestlife-staging", "home");
// => "homepage"

// Resolve a page key (or alias) to its slug
const page = resolvePageSlug("bestlife-staging", "home");
// => { slug: "bestlife-homepage-agent-draft", title: "Homepage", canonicalKey: "homepage" }

// Resolve base URL from env
const url = resolveBaseUrl("bestlife-staging");
// => "https://stg-e25ss3.elementor.cloud"

// List all registered sites
listSiteKeys();
// => ["bestlife-staging", "llif-staging"]

// List page keys for a site
listPageKeys("bestlife-staging");
// => ["homepage", "about", "articles", "contact", "wellness", "subscribe"]
```

## Adding a new site

1. Create `targets/<site-key>.json` with the structure above
2. Add credential env vars to `.env` (and `.env.example`)
3. Add `<site-key>` to the `site_key` enum in `marketing-artifacts/schema.js` if artifacts reference it directly
