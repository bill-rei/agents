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
  "site_key": "llif-staging",
  "label": "LLIF – Staging",
  "environment": "staging",
  "base_url_env": "WP_LLIF_STAGING_URL",
  "pages": {
    "home":    { "slug": "home",    "title": "Homepage" },
    "about":   { "slug": "about",   "title": "About" }
  }
}
```

| Field          | Purpose |
|----------------|---------|
| `site_key`     | Must match the filename. Used in artifacts and CLI flags. |
| `label`        | Human-readable label for logs and usage output. |
| `environment`  | Must be `"staging"` — the publisher refuses non-staging sites. |
| `base_url_env` | Name of the env var holding the WordPress base URL. |
| `pages`        | Map of `page_key` → `{ slug, page_id?, title? }`. |

## Credentials

Credentials stay in `.env`, never in registry files:

```
WP_LLIF_STAGING_URL=https://staging.llif.example.com
WP_LLIF_STAGING_USER=bot
WP_LLIF_STAGING_APP_PASSWORD=xxxx
```

The registry's `base_url_env` tells the loader which env var to read.

## CLI usage

### Publish with registry overrides

```bash
# Dry-run: publish an artifact to a specific site + page
node scripts/publish.js --file artifact.json --site llif-staging --page home --dry-run

# Apply
node scripts/publish.js --file artifact.json --site llif-staging --page about --apply
```

`--site` and `--page` inject `target.site_key` and `target.slug` into each artifact before validation and publishing. This means the artifact file itself doesn't need to contain these fields.

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

## Programmatic API

```js
const {
  loadRegistry,
  resolvePageSlug,
  resolveBaseUrl,
  listSiteKeys,
  listPageKeys,
} = require("./lib/targetRegistry");

// Load a site's full registry
const reg = loadRegistry("llif-staging");
// => { site_key, label, environment, base_url_env, pages: { ... } }

// Resolve a page key to its slug
const page = resolvePageSlug("llif-staging", "home");
// => { slug: "home", title: "Homepage" }

// Resolve base URL from env
const url = resolveBaseUrl("llif-staging");
// => "https://staging.llif.example.com"

// List all registered sites
listSiteKeys();
// => ["bestlife-staging", "llif-staging"]

// List page keys for a site
listPageKeys("llif-staging");
// => ["home", "about", "programs", "blog", "contact", "longevity", "membership"]
```

## Adding a new site

1. Create `targets/<site-key>.json` with the structure above
2. Add credential env vars to `.env` (and `.env.example`)
3. Add `<site-key>` to the `site_key` enum in `marketing-artifacts/schema.js` if artifacts reference it directly
