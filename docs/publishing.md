# Publishing Pipeline

The publisher CLI (`scripts/publish.js`) routes marketing artifacts to platform-specific adapters. This document covers artifact format, the markdown-to-HTML fallback, and common workflows.

## Artifact format

All artifacts must conform to the marketing-artifact JSON schema (`marketing-artifacts/schema.js`). The three supported types:

### web_page

```json
{
  "artifact_id": "unique-id",
  "brand": "bestlife",
  "artifact_type": "web_page",
  "target": {
    "platform": "wordpress",
    "site_key": "bestlife-staging",
    "slug": "bestlife-homepage-agent-draft"
  },
  "content": {
    "title": "Page Title",
    "html": "<h2>Welcome</h2><p>Content here...</p>"
  },
  "status": "draft",
  "provenance": { "agent": "website-messaging-architect", "created_at": "..." },
  "human_approval": false
}
```

### social_post

```json
{
  "artifact_type": "social_post",
  "target": { "platform": "x" },
  "content": { "body": "Check out our new article! #wellness" }
}
```

### blog_post

```json
{
  "artifact_type": "blog_post",
  "target": { "platform": "wordpress" },
  "content": { "title": "Blog Title", "markdown": "## Introduction\n\n..." }
}
```

## Markdown fallback for web_page

The `content.html` field in a web_page artifact can contain either HTML or Markdown. The WP adapter automatically detects and converts:

1. **HTML detected** (starts with `<tag>` or contains block-level tags) → passed through unchanged
2. **Markdown detected** (headings, bold, bullets, links) → converted to HTML via the `marked` library
3. **Plain text** → wrapped in `<p>` tags

This means agents can produce Markdown and the publisher will handle conversion. During dry-run, you'll see `[md→html] Converted markdown content to HTML` in the output.

### Example: markdown input

```json
{
  "content": {
    "title": "Homepage",
    "html": "## Welcome\n\nYour journey to **wellness** starts here.\n\n- Guidance\n- Tips\n- Community"
  }
}
```

The publisher converts this to:

```html
<h2>Welcome</h2>
<p>Your journey to <strong>wellness</strong> starts here.</p>
<ul>
<li>Guidance</li>
<li>Tips</li>
<li>Community</li>
</ul>
```

## Title safety

By default, the publisher **does not overwrite** the WordPress page title. This prevents accidental title changes when you only want to update page content.

To explicitly update the title, pass `--update-title`:

```bash
node scripts/publish.js --file artifact.json --site bestlife-staging --page homepage --apply --update-title
```

## CLI workflows

### Dry-run (preview only)

```bash
# Using the npm script (BestLife homepage example)
npm run publish:dry

# Custom artifact
node scripts/publish.js --file my-artifact.json --site bestlife-staging --page homepage --dry-run
```

Dry-run output shows:
- Registry resolution (site label, page alias → canonical key → slug)
- Markdown conversion (if applicable)
- The WP API payload that *would* be sent
- No actual API calls are made

### Apply (publish to staging)

```bash
node scripts/publish.js --file artifact.json --site bestlife-staging --page homepage --apply
```

### Batch publish

```bash
# Publish all artifacts in a batch file
node scripts/publish.js --file artifacts-batch.json --apply

# Filter to a specific site
node scripts/publish.js --file artifacts-batch.json --only site_key=bestlife-staging --apply
```

### Page aliases

The target registry supports aliases for convenience:

```bash
# These are equivalent:
node scripts/publish.js --file a.json --site bestlife-staging --page home --dry-run
node scripts/publish.js --file a.json --site bestlife-staging --page homepage --dry-run
```

Aliases are defined in `targets/<site-key>.json` under the `aliases` field.

## Adapters

| Artifact type | Platform | Adapter | Notes |
|---------------|----------|---------|-------|
| `web_page` | wordpress | `publishers/web/wpElementorStaging.js` | Staging-only safety guard |
| `social_post` | x | `publishers/social/xDirect.js` | Requires `--force-live` for status=published |
| `social_post` | linkedin | `publishers/social/linkedinDirect.js` | Requires `--force-live` for status=published |
| `social_post` | x, linkedin, facebook, instagram | `publishers/social/zohoSocial.js` | For draft/scheduled posts |
| `social_post` | reddit | `publishers/social/redditGuard.js` | Content policy guard |
| `blog_post` | * | (stub) | Not yet implemented |

## Portal integration

The portal (`apps/portal/`) publishes artifacts through the same CLI:

1. User approves artifacts in the review UI
2. Portal API calls `publishBridge.ts` which shells out to `scripts/publish.js`
3. Results are logged in the `PublishLog` table
4. Successful publishes update artifact status to `published`

See [portal-local-setup.md](portal-local-setup.md) for portal setup instructions.
