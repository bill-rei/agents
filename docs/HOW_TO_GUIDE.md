# How-To Guide — Marketing Agents Platform

> **Audience:** Jim + new engineers + power users
> **Repo root:** `/home/mcb/projects/agents/`
> Cross-references: [ARCHITECTURE_INVENTORY.md](ARCHITECTURE_INVENTORY.md) · [DIAGRAMS.mmd](DIAGRAMS.mmd)

---

## Quick Start

### Prerequisites

- **Node.js 18+** (agents + portal both require it)
- **Docker** (for PostgreSQL via docker-compose)
- **npm** (no Yarn/pnpm required; root and portal both use npm)
- API keys: `ANTHROPIC_API_KEY` + `OPENAI_API_KEY` (agents require both on startup)
- WordPress staging credentials (for web page publishing)

### 1 — Clone and install

```bash
git clone <repo-url> && cd agents

# Install root dependencies (agent servers + CLI)
npm install

# Install portal dependencies
cd apps/portal && npm install && cd ../..
```

### 2 — Configure environment

#### Root `.env` (for agent servers + publish CLI)

```bash
cp .env.example .env
# Edit .env — fill in:
#   ANTHROPIC_API_KEY=
#   OPENAI_API_KEY=
#   WP_LLIF_STAGING_URL=     (e.g. https://stg-xxxx.elementor.cloud)
#   WP_LLIF_STAGING_USER=
#   WP_LLIF_STAGING_APP_PASSWORD=
#   WP_BESTLIFE_STAGING_URL=
#   WP_BESTLIFE_STAGING_USER=
#   WP_BESTLIFE_STAGING_APP_PASSWORD=
```

#### Portal `.env.local`

```bash
cd apps/portal
cp .env.example .env.local
# Defaults work for docker-compose postgres. Edit:
#   PORTAL_JWT_SECRET=<random-string>    ← CHANGE THIS
#   (BLA_X_*, BLA_LINKEDIN_*, etc. only needed for BestLife direct social publish)
```

### 3 — Start PostgreSQL (portal only)

```bash
cd apps/portal
docker compose up -d
# Postgres runs on port 5433, DB: portal, user: portal, password: portal_dev
```

> If you installed Postgres natively (port 5432), update `DATABASE_URL` in `.env.local`.

### 4 — Run database migrations + seed

```bash
cd apps/portal
npx prisma migrate deploy   # apply all migrations
npm run db:seed             # creates admin user + example workspaces
```

Default seed credentials: `admin@portal.local` / `admin123`

### 5 — Start agent servers

```bash
# From repo root — starts ALL 8 agents
npm run start:all

# OR start individually (useful for debugging one agent)
npm run start:marketing-compiler   # port 3000
npm run start:editor               # port 3001
npm run start:site-auditor         # port 3002
npm run start:strategist           # port 3003
npm run start:distributor          # port 3004
npm run start:optimizer            # port 3005
npm run start:wma                  # port 3006 (website-messaging-architect)
npm run start:renderer             # port 3007 (web-renderer)
```

### 6 — Start the Portal

```bash
# From repo root
npm run start:portal        # → http://localhost:4000

# OR from apps/portal/
npm run dev                 # development mode with hot reload
```

### 7 — Verify environment

```bash
npm run check:env           # checks ANTHROPIC_API_KEY + OPENAI_API_KEY
```

---

## Common Tasks

### A — Compile an artifact via agent → validate → review → publish

This is the primary end-to-end workflow. All steps happen in the Portal UI.

**Step 1: Create workspace + project**
1. Log in at `http://localhost:4000/login`
2. Go to **Workspaces** → **New Workspace** (or use seeded "Brand Alpha")
3. Click into the workspace → **New Project**
   - Give it a name and slug
   - Select target(s) from the registry dropdown — e.g., `llif-staging` (LLIF web) or `bestlife-staging + bestlife-social` (BestLife web + social)
   - **Brand boundary:** you cannot mix LLIF and BestLife targets in the same project (rejected at API level)

**Step 2: Create a run**
1. Go to **Runs** → **New Run**
2. Select workspace, project, and workflow type (Campaign or Web)
3. The run becomes your workspace for this campaign

**Step 3: Upload project-level reference docs (optional)**
1. From the project card, click **Docs & Settings**
2. Upload PDFs, DOCX, TXT, MD, CSV, JSON, or XLSX files
3. These auto-attach to every agent execution in this project

**Step 4: Run an agent**
1. Inside the run, go to the **Agents** tab
2. Select an agent (e.g., Compiler)
3. Fill in input fields — or paste output from a previous agent
4. Click **Execute** — the portal calls the agent Express server, streams the output, and saves an `AgentExecution` record

**Step 5: Promote output to artifact**
1. Open the completed execution
2. Click **Save as Artifact** — select type (web_page / social_post / blog_post) and set metadata
3. The artifact is now in `draft` status

**Step 6: Review and approve**
1. Go to the **Review** tab
2. For each artifact: **Approve**, **Reject**, or **Request Changes**
3. Only `approved` artifacts can be published

**Step 7: Publish**
1. Go to the **Publish** tab
2. Check **Dry Run** first (default) — verify the output before committing
3. Uncheck **Dry Run** → click **Publish Selected**
4. Results appear per-artifact with stdout/stderr; `PublishLog` record created
5. Successful artifacts update to `published` status

---

### B — Publish a web page to WordPress

This covers the CLI path (for engineers) and the portal path (for operators).

#### Via CLI (direct, for testing/scripting)

```bash
# Dry-run: show what would be published
node scripts/publish.js \
  --file examples/artifacts/web/bestlife-homepage-markdown.json \
  --site bestlife-staging \
  --page homepage \
  --dry-run

# Apply: actually push to WordPress staging
node scripts/publish.js \
  --file my-artifact.json \
  --site bestlife-staging \
  --page homepage \
  --apply

# To also overwrite the page title (default: title is preserved)
node scripts/publish.js \
  --file my-artifact.json \
  --site bestlife-staging \
  --page homepage \
  --apply \
  --update-title
```

**Available sites and pages:**
```bash
node scripts/publish.js   # prints usage + lists all registered sites and their page keys
```

#### Page slug lookup behavior

When you pass `--site` and `--page`, the CLI:
1. Loads `targets/{site-key}.json`
2. Resolves alias if needed (e.g., `home` → `homepage` in bestlife-staging)
3. Gets the slug (e.g., `bestlife-homepage-agent-draft`)
4. If no `page_id` in the artifact, calls `GET /wp-json/wp/v2/pages?slug={slug}` to look up the WP page ID
5. Calls `POST /wp-json/wp/v2/pages/{pageId}` with the content

#### Via Portal
Same as task A step 7 — select the run's approved `web_page` artifacts and click Publish.

The portal:
1. Calls `apps/portal/src/lib/publishBridge.ts` — writes a temp JSON file + shells out to `scripts/publish.js`
2. Captures stdout/stderr
3. Creates a `PublishLog` row
4. On success, also creates a `ContentItem` for Zoho export

#### Artifact format for web_page

```json
{
  "artifact_id": "my-page-v1",
  "brand": "bestlife",
  "artifact_type": "web_page",
  "target": {
    "platform": "wordpress",
    "site_key": "bestlife-staging",
    "slug": "bestlife-homepage-agent-draft"
  },
  "content": {
    "title": "Page Title",
    "html": "<h2>Welcome</h2><p>Content here...</p>",
    "status": "draft"
  },
  "status": "approved",
  "provenance": { "agent": "website-messaging-architect", "created_at": "2026-02-19T00:00:00Z" },
  "human_approval": true
}
```

> **Note:** The `content.html` field accepts HTML or Markdown. The WP publisher auto-detects and converts Markdown.

---

### C — Push media assets

#### Upload via Portal UI
1. Inside a run → **Assets** tab → **Upload**
2. Supports images, PDFs, documents
3. Assets are stored at `uploads/{projectSlug}/{runId}/{filename}`

#### Link an asset to an artifact
1. Go to the artifact's edit view → **Assets** section
2. Attach uploaded assets with placement (above/below/inline), alignment, size, and alt text
3. When publishing, the WP adapter uploads each image to the WordPress Media Library and injects `<figure>` HTML into the content

#### Project-level docs (not media — reference documents)
1. Project card → **Docs & Settings**
2. Upload PDF/DOCX/TXT/MD/CSV/JSON/XLSX
3. Auto-attached to every agent execution in this project (via multipart FormData)

---

### D — Use Zoho Social (LLIF bulk CSV export)

> **Status:** The Zoho Social OAuth2 integration is **not yet live** (the API adapter is a stub). The portal generates a bulk CSV file ready for manual upload to Zoho Social's Bulk Scheduler.

**Workflow:**
1. Publish an LLIF social artifact from the Publish tab
2. The portal creates a `ContentItem` record with the post caption + image URLs
3. Go to **Export → Zoho Social** in the portal
4. Select date range and brand (LLIF)
5. Download the ZIP containing per-channel CSV files
6. Upload CSVs to Zoho Social → Bulk Scheduler → Import

**CSV format:** Date, Time, Message, Link URL, Image URL 1–10 (Zoho bulk import format)

**Code location:**
- CSV builder: `apps/portal/src/lib/zohoExport.ts`
- Content item store: `apps/portal/src/lib/contentItemStore.ts` (JSONL flat file)
- Export API: `apps/portal/src/app/api/exports/zoho-social/route.ts`

---

### E — Publish BestLife social (direct API + assist pack)

BestLife has a separate publishing workflow that bypasses Zoho entirely.

**Channels:**
- **Direct API** (automated): X/Twitter, LinkedIn Company Page, Facebook Page
- **Assist Pack** (human-assisted): Instagram, Threads, BlueSky, Reddit, YouTube, TikTok

**In the Portal UI:**
1. Go to the run's **Publish** tab — for BestLife projects, you'll see **Best Life Social** section
2. Select a `social_post` artifact with `metadata.brand = "bestlife"` in `approved` or `published` status
3. Check/uncheck channels in two groups:
   - **Direct API Publish** (3 channels — automated)
   - **Assist Pack** (6 channels — human-posted)
4. Each channel shows a character count with color coding (green/yellow/red)
5. Click **Preview** for a dry-run showing what text would be posted
6. Click **Publish Direct + Generate Assist Pack**
7. Direct channels post immediately in parallel
8. An assist pack (JSON + Markdown) is generated for the assist channels

**Download the assist pack:**
- From the job result panel: **Download JSON** or **Download Markdown**
- The Markdown file contains per-channel post copy + step-by-step posting instructions for each platform

**Via API (for scripting):**
```bash
# Trigger a BestLife social publish
curl -X POST http://localhost:4000/api/publish/bestlife/social \
  -H "Content-Type: application/json" \
  -b "portal_session=<token>" \
  -d '{
    "artifactId": "<artifact-id>",
    "selectedChannels": ["x_profile", "linkedin_company_page", "instagram_profile"]
  }'

# Dry-run preview
curl -X POST http://localhost:4000/api/publish/bestlife/social \
  -d '{ "artifactId": "...", "selectedChannels": ["x_profile"], "dryRun": true }'
```

---

### F — Site Auditor → Compiler pipeline (web refresh workflow)

This is the "web pipeline" — for refreshing website copy based on live site analysis.

**Step 1: Run Site Auditor**
1. Agents tab → **Site Auditor**
2. Inputs: domain URL, specific page URLs to audit, audience segments
3. Output: structured analysis of current copy vs. brand/product reality

**Step 2: Run Messaging Architect**
1. Agents tab → **Messaging Architect**
2. Paste Site Auditor output → `siteAuditInput` field (or use `fromAgent` auto-populate)
3. Add theme from Strategist if available
4. Output: structured web page copy (sections, headlines, CTAs)

**Step 3: Run Web Renderer**
1. Agents tab → **Web Renderer**
2. Paste Messaging Architect output → `rawCopy` field
3. Add page name and any rendering constraints
4. Output: clean semantic HTML ready for WordPress

**Step 4: Publish to WordPress**
1. Save Renderer output as `web_page` artifact
2. Set target slug from the registry
3. Approve → Publish

---

## Troubleshooting — Top 10 Failures

### 1. `Missing env vars for site "X"` (WP publisher)
**Error:** `Error: Missing env vars for site "bestlife-staging". Expected: WP_BESTLIFE_STAGING_URL, WP_BESTLIFE_STAGING_USER, WP_BESTLIFE_STAGING_APP_PASSWORD`
**Fix:** Add the three env vars to root `.env`. The publisher reads these via `resolveSiteConfig()` in `publishers/web/wpElementorStaging.js:34`.

### 2. `Refusing to publish: URL does not look like a staging site`
**Error:** `Error: Refusing to publish: URL for "bestlife-staging" does not look like a staging site`
**Fix:** The `WP_BESTLIFE_STAGING_URL` must contain "staging", "stg-", or "stg." (`wpElementorStaging.js:52`). Check the URL in `.env`.

### 3. `No target registry found for site_key "X"`
**Error:** `Error: No target registry found for site_key "my-site". Expected file: targets/my-site.json`
**Fix:** Create `targets/my-site.json` with the correct structure (see `docs/targets.md`). The `site_key` in the file must match the filename.

### 4. `No page found with slug "X"` (WP slug lookup)
**Error:** `Error: No page found with slug "bestlife-homepage-agent-draft"`
**Fix:** The WordPress staging site doesn't have a page with that slug. Either: (a) create the WP page with that exact slug, or (b) add a `page_id` directly to the artifact target so slug lookup is skipped, or (c) update the slug in `targets/bestlife-staging.json`.

### 5. `Artifact validation failed` (schema errors)
**Error:** `Error: Artifact validation failed: - content/html must NOT have fewer than 1 characters`
**Fix:** Run `validateArtifact()` from `marketing-artifacts/validate.js` manually to see all errors. Common causes: missing `content.html` for web_page, missing `content.body` for social_post.

### 6. `No approved artifacts to publish` (portal publish)
**Error:** `{ "error": "No approved artifacts to publish" }` from `POST /api/publish/run/[runId]`
**Fix:** Go to the Review tab and approve the artifacts first. Only `status: "approved"` artifacts are picked up.

### 7. Portal can't connect to agents (`ECONNREFUSED localhost:3000`)
**Error:** `Error: connect ECONNREFUSED 127.0.0.1:3000` in agent execution
**Fix:** The marketing-compiler agent is not running. Run `npm run start:marketing-compiler` (or `npm run start:all`). Check agent health at `GET /api/agents/health`.

### 8. `DATABASE_URL` connection errors
**Error:** `Error: Can't reach database server at localhost:5432`
**Fix:** PostgreSQL is not running. Run `docker compose up -d` from `apps/portal/`. If using native Postgres, verify it's on the port specified in `DATABASE_URL`.

### 9. `Unauthorized` on portal API calls
**Error:** `{ "error": "Unauthorized" }` from any portal API
**Fix:** Your session cookie expired (1-day TTL). Log in again at `/login`. If building against the API directly, extract the `portal_session` cookie after login.

### 10. `Zoho OAuth2 not yet integrated`
**Error:** `Error: Zoho OAuth2 not yet integrated. Implement token refresh at publishers/social/zohoSocial.js:getAccessToken()`
**Fix:** The Zoho live-post path is a stub. Use the **Zoho Social CSV export** workflow instead (see task D). The CSV can be imported into Zoho Social's Bulk Scheduler manually.

### Bonus: BestLife publish — `BRAND_MISMATCH`
**Error:** `{ "code": "BRAND_MISMATCH", "message": "Brand boundary violation..." }`
**Fix:** The artifact's brand is not "bestlife". Check `metadata.brand` on the artifact. The BestLife social publisher only accepts bestlife-branded artifacts (`publishers/bestlife/index.ts:30`).

---

## Security & Privacy Notes

### Secrets management
- **Never commit `.env` files.** The repo has `.gitignore` entries for `.env` and `.env.local`.
- API keys live in `.env` (root) and `.env.local` (portal). Read `.env.example` files to see what's needed.
- WordPress application passwords are used (not account passwords). These are scoped to a single application.
- LinkedIn access tokens expire every 60 days — rotate proactively.
- BestLife social API credentials use the prefix `BLA_` (Best Life App); LLIF credentials use `LLIF_` or `WP_LLIF_`.

### Authentication
- Portal sessions use HttpOnly, SameSite=Lax cookies — protected against XSS and CSRF
- Default JWT secret is `dev-secret-change-me` — **MUST be changed in production** (`PORTAL_JWT_SECRET`)
- Seed password `admin123` — **MUST be changed in production**

### Staging-only guard
- The WP publisher (`wpElementorStaging.js:49`) refuses to publish to any URL that doesn't look like staging. This prevents accidentally overwriting production content even if credentials are misconfigured.

### Brand isolation
- LLIF and BestLife are fully isolated at the project level. A project can only have targets from one brand.
- BestLife social posts never go through LLIF's Zoho integration, and vice versa.
- Brand boundary is enforced at three independent layers (project creation, publish routing, BestLife publisher) — see `ARCHITECTURE_INVENTORY.md §9`.

### Least privilege
- WordPress uses Application Passwords — create a dedicated app password for the bot user, not the admin password.
- BlueSky: use an App Password (post-only scope), not your account password.
- LinkedIn: token needs only `w_organization_social` scope.
- Facebook: use a Page Access Token scoped to the specific page, not a user token.

### File uploads
- Project reference docs and run assets are stored in `uploads/` — this directory should be outside the web root or protected by auth. The portal API serves assets through `/api/assets/[assetId]` (authenticated).

---

## Appendix — Command Reference

### Root npm scripts

| Command | Description |
|---------|-------------|
| `npm run start:all` | Start all 8 agent servers |
| `npm run start:marketing-compiler` | Start Compiler (port 3000) |
| `npm run start:editor` | Start Editor (port 3001) |
| `npm run start:site-auditor` | Start Site Auditor (port 3002) |
| `npm run start:strategist` | Start Strategist (port 3003) |
| `npm run start:distributor` | Start Distributor (port 3004) |
| `npm run start:optimizer` | Start Optimizer (port 3005) |
| `npm run start:wma` | Start Website Messaging Architect (port 3006) |
| `npm run start:renderer` | Start Web Renderer (port 3007) |
| `npm run start:portal` | Start Portal dev server (port 4000) |
| `npm run publish:dry` | Dry-run example BestLife homepage publish |
| `npm run check:env` | Verify ANTHROPIC_API_KEY + OPENAI_API_KEY are set |
| `npm test` | Run marketing-artifacts JS tests |

### Portal npm scripts (from `apps/portal/`)

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Next.js dev server on port 4000 |
| `npm run build` | Build production Next.js bundle |
| `npm start` | Start production server on port 4000 |
| `npm run db:migrate` | Run `prisma migrate dev` (interactive, adds migration) |
| `npm run db:seed` | Seed DB with admin user + example data |
| `npm run db:studio` | Open Prisma Studio GUI at http://localhost:5555 |
| `npx tsx --test __tests__/*.test.ts` | Run Portal TypeScript tests |

### Publish CLI

```bash
node scripts/publish.js                         # show usage + list sites
node scripts/publish.js --file <artifact.json> --dry-run
node scripts/publish.js --file <artifact.json> --apply
node scripts/publish.js --file <artifacts.json> --apply --only site_key=llif-staging
node scripts/publish.js --file <artifact.json> --site llif-staging --page home --dry-run
node scripts/publish.js --file <artifact.json> --site bestlife-staging --page homepage --apply --update-title
```

### Target registry CLI

```bash
# List all registered sites and page keys
node scripts/publish.js   # (no args — prints usage with sites)
```

### Database

```bash
cd apps/portal
docker compose up -d           # start Postgres
docker compose down            # stop Postgres
npx prisma migrate dev         # add new migration (dev only)
npx prisma migrate deploy      # apply migrations (production)
npx prisma db seed             # re-seed
npx prisma studio              # GUI browser for DB
```
