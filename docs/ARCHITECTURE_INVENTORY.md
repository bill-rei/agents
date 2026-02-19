# Architecture Inventory — Marketing Agents Platform

> **Last verified:** 2026-02-19
> **Repo root:** `/home/mcb/projects/agents/`
> Cross-references: [HOW_TO_GUIDE.md](HOW_TO_GUIDE.md) · [DIAGRAMS.mmd](DIAGRAMS.mmd) · [REPO_MAP.json](REPO_MAP.json)

---

## 1. High-Level Purpose

This repo is a **dual-brand marketing operations platform** for two brands — **LLIF** (livelifeimmune.com / LLIF.org) and **Best Life** (getbestlife.com / BestLife.app). It provides:

1. **AI agent pipeline** — Eight specialized LLM-backed agents (Strategist → Compiler → Editor → Distributor → Optimizer; Site Auditor → Messaging Architect → Web Renderer) that research, draft, and refine marketing content.
2. **Operator portal** — A Next.js web app where team members orchestrate agent runs, review AI output, manage media assets, approve artifacts, and trigger publishing.
3. **Publisher adapters** — Brand-specific, environment-safe adapters that push approved artifacts to WordPress (web pages), BestLife social channels (direct API), and LLIF Zoho Social (bulk CSV export).

---

## 2. Component Map

### UI Layer (Portal)
- **Portal web app** — `apps/portal/` — Next.js 14 App Router, Tailwind CSS, port 4000
  - Workspaces → Projects → Runs → Artifacts → Approvals → Publish
  - Agents tab for triggering individual AI agents
  - Asset/file management with local disk storage
  - BestLife Social Panel (direct publish + assist pack generator)

### API / Server Layer
- **Portal API routes** — `apps/portal/src/app/api/` — Next.js Route Handlers (see §5)
- **Agent Express servers** — 8 independent Express.js HTTP servers (see §3)

### Agents
| Agent key | Port | Description | Pipeline |
|-----------|------|-------------|----------|
| `strategist` | 3003 | Decides which campaign to run based on GTM priorities | Both |
| `marketing-compiler` | 3000 | Compiles structured inputs into campaign drafts | Campaign |
| `editor` | 3001 | Improves clarity, quality, and channel-fit of assets | Campaign |
| `distributor` | 3004 | Prepares finalized assets per channel norms | Campaign |
| `optimizer` | 3005 | Analyzes post-distribution signals, translates to upstream learnings | Campaign |
| `site-auditor` | 3002 | Crawls and evaluates live website content vs. brand reality | Web |
| `website-messaging-architect` | 3006 | Transforms page audits + strategy into web page copy | Web |
| `web-renderer` | 3007 | Converts structured web copy into semantic HTML for WordPress | Web |

Entry: `agents.registry.json` → each value is `./agentName/server.js`
Server pattern: `marketing-compiler/server.js:17` — Express POST `/api/compile`, multer for file uploads

### Validators
- **Artifact schema** — `marketing-artifacts/schema.js` — AJV JSON Schema for all artifact types (web_page, social_post, blog_post)
- **Artifact validator** — `marketing-artifacts/validate.js` — exposes `validateArtifact()`
- **Brand boundary validator** — `apps/portal/src/lib/targetRegistry.ts:141` — `validateBrandBoundary()` prevents mixing LLIF and BestLife targets in a project
- **BestLife social validator** — `apps/portal/src/lib/publishers/bestlife/index.ts:30` — `validateBestLifePublish()` enforces brand + channel rules

### Renderers
- **Markdown → HTML** — `lib/markdownToHtml.js` — used by WP publisher to convert agent Markdown output to HTML before WP push
- **Web Renderer agent** — `web-renderer/server.js` — LLM-backed agent that produces semantic HTML from structured copy
- **Design-Locked publisher** — `apps/portal/src/lib/wp/publishDesignLockedPage.ts` — pushes structured JSON content into brand-templated WP pages via ACF fields

### Publishers
- **WP Elementor Staging** — `publishers/web/wpElementorStaging.js` — REST API push to WordPress pages; staging-only guard
- **Zoho Social (LLIF)** — `publishers/social/zohoSocial.js` — **stub** (token exchange not yet live); builds CSV export via `apps/portal/src/lib/zohoExport.ts`
- **X Direct** — `publishers/social/xDirect.js` — Twitter v2 API; live posts only with `--force-live`
- **LinkedIn Direct** — `publishers/social/linkedinDirect.js` — UGC Posts API; live posts only
- **Reddit Guard** — `publishers/social/redditGuard.js` — content policy safety check
- **BestLife Direct Publisher** — `apps/portal/src/lib/publishers/bestlife/directPublisher.ts` — X (OAuth 1.0a), LinkedIn (OAuth 2.0), Facebook (Graph API v21.0)
- **BestLife Assist Pack Generator** — `apps/portal/src/lib/publishers/bestlife/assistPackGenerator.ts` — generates JSON + Markdown posting guides for Instagram, Threads, BlueSky, Reddit, YouTube, TikTok
- **BestLife Orchestrator** — `apps/portal/src/lib/publishers/bestlife/index.ts` — validation + fan-out: direct channels in parallel (`Promise.allSettled`), assist pack generation, `PublishJob` DB record creation

### DB / Storage
- **PostgreSQL** — Prisma ORM, schema at `apps/portal/prisma/schema.prisma`
- **Local disk** — `apps/portal/uploads/` (configurable via `UPLOAD_DIR`)
- **Publish log (JSONL)** — `publish-log.jsonl` at repo root — written by CLI-side publisher adapters
- **Content items (JSONL)** — `apps/portal/data/content-items.jsonl` — in-memory log of social content created for Zoho export
- **Assist packs** — `uploads/{projectSlug}/_publish_jobs/{jobId}.json` and `.md`

### Logging
- `publish-log.jsonl` — append-only JSONL written by `wpElementorStaging.js` and `zohoSocial.js`
- `PublishLog` DB table — written by portal publish API for every publish attempt
- `AgentExecution` DB table — input/output for every portal agent execution

---

## 3. Entry Points

| Component | Entry Point | How to Start |
|-----------|-------------|--------------|
| Portal | `apps/portal/src/app/layout.tsx` | `npm run start:portal` (from repo root) or `npm run dev` (from `apps/portal/`) |
| All agents | `agents.registry.json` → `scripts/start-all.js` | `npm run start:all` |
| Single agent | `scripts/start-agent.js <agentKey>` | `npm run start:marketing-compiler` |
| Publish CLI | `scripts/publish.js` | `node scripts/publish.js --file <artifact.json> --dry-run` |
| Env check | `scripts/check-env.js` | `npm run check:env` |
| Marketing-staging-sync | `marketing-staging-sync/push-page.mjs` (CLI type) | `npm run start:staging-sync -- <args>` |

---

## 4. Key Modules

| Module | Path | Purpose |
|--------|------|---------|
| Target Registry (JS) | `lib/targetRegistry.js` | Resolves `(site_key, page_key)` → slug; in-memory cache |
| Target Registry (TS) | `apps/portal/src/lib/targetRegistry.ts` | Portal version; adds brand boundary validation, social registry types |
| Artifact Mapper | `apps/portal/src/lib/artifactMapper.ts` | Converts DB `Artifact` → marketing-artifact JSON for publish CLI |
| Publish Bridge | `apps/portal/src/lib/publishBridge.ts` | Shells out to `scripts/publish.js` via `child_process.execFile` |
| Agent Gateway | `apps/portal/src/lib/agentGateway.ts` | AGENTS config, `executeAgent()`, health checks; routes JSON or multipart FormData |
| Storage | `apps/portal/src/lib/storage.ts` | `saveFile()`, `saveProjectFile()`, `getFilePath()`, `deleteFile()` |
| Auth | `apps/portal/src/lib/auth.ts` | JWT + bcrypt; `requireAuth()`, `getSession()`, session cookie helpers |
| DB client | `apps/portal/src/lib/db.ts` | Prisma singleton |
| Artifact schema | `marketing-artifacts/schema.js` | AJV JSON Schema — source of truth for artifact shape |
| Artifact validator | `marketing-artifacts/validate.js` | `validateArtifact(artifact)` → `{ valid, errors[] }` |
| Zoho export | `apps/portal/src/lib/zohoExport.ts` | CSV + ZIP builder for Zoho Social Bulk Scheduler |
| Content item store | `apps/portal/src/lib/contentItemStore.ts` | JSONL-backed list of social content items ready for Zoho export |
| Channel registry | `apps/portal/src/lib/publishers/bestlife/channelRegistry.ts` | Loads `targets/bestlife-social.json`; `truncateForChannel()`, channel key lists |
| Design contract | `apps/portal/src/lib/designContract/` | TBD (not fully explored) — structured page templates |
| WP client | `apps/portal/src/lib/wp/wpClient.ts` | Low-level WP REST API helpers |
| Markdown → HTML | `lib/markdownToHtml.js` | Heuristic detection + `marked` conversion |
| LLM abstraction | `lib/llm.js` | Wraps Anthropic SDK; `compile(userMessage, systemPrompt)` |
| Doc parser | `lib/parse-doc.js` | Parses PDF, DOCX, TXT, MD, CSV, JSON — used for reference doc uploads |

---

## 5. API Route Map (Portal)

All routes are under `apps/portal/src/app/api/`. All require auth (`requireAuth()`) unless noted.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | Login (no auth required) |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/auth/me` | Current user |
| GET | `/api/agents` | List all agents with config |
| GET | `/api/agents/health` | Health check all agents |
| POST | `/api/agents/[agentKey]/execute` | Execute an agent, attach project docs, save AgentExecution |
| GET | `/api/agents/[agentKey]/executions` | List executions for an agent+run |
| GET | `/api/agents/executions/[execId]` | Get single execution |
| POST | `/api/agents/executions/[execId]/to-artifact` | Promote execution output to Artifact |
| GET/POST | `/api/workspaces` | List/create workspaces |
| GET/POST | `/api/workspaces/[workspaceId]/projects` | List/create projects (validates brand boundary) |
| GET | `/api/runs` | List runs |
| POST | `/api/runs` | Create run |
| GET | `/api/runs/[runId]/artifacts` | List artifacts for a run |
| POST | `/api/runs/[runId]/artifacts` | Create artifact |
| GET/PATCH/DELETE | `/api/runs/[runId]/artifacts/[artifactId]` | Get/update/delete artifact |
| GET | `/api/runs/[runId]/assets` | List assets for a run |
| POST | `/api/assets/upload` | Upload asset file |
| GET | `/api/assets/[assetId]` | Serve/download asset file |
| GET/POST | `/api/artifacts/[artifactId]/assets` | List/add assets linked to artifact |
| DELETE | `/api/artifacts/[artifactId]/assets/[assetId]` | Unlink asset from artifact |
| POST | `/api/approvals` | Submit approval decision |
| POST | `/api/publish/run/[runId]` | Fan-out publish all approved artifacts in a run |
| POST | `/api/publish/designLocked` | Publish design-locked structured page |
| POST/GET | `/api/publish/bestlife/social` | BestLife direct publish or dry-run preview |
| GET | `/api/publish/bestlife/jobs/[jobId]/assist-pack` | Download assist pack JSON or MD |
| GET | `/api/exports/zoho-social` | Export Zoho Social CSV/ZIP for LLIF content items |
| GET/POST/DELETE | `/api/projects/[projectId]/docs` | Manage project-level reference documents |
| GET | `/api/registry/sites` | List all target registries with type/brand/channel metadata |
| GET/POST | `/api/content-items` | List/create content items for Zoho export |

---

## 6. External Systems

| System | Where Used | Purpose | Notes |
|--------|-----------|---------|-------|
| **WordPress REST API** | `publishers/web/wpElementorStaging.js`, `apps/portal/src/lib/wp/wpClient.ts` | Push page content + upload media | Staging-only (URL must contain "staging" or "stg-") |
| **Twitter/X v2 API** | `apps/portal/src/lib/publishers/bestlife/directPublisher.ts:27` | Post tweets for BestLife | OAuth 1.0a; needs elevated access for media |
| **LinkedIn UGC Posts API** | `directPublisher.ts` | Post LinkedIn updates for BestLife | OAuth 2.0; token expires every 60 days |
| **Facebook Graph API v21.0** | `directPublisher.ts` | Post to BestLife Facebook page | Long-lived page access token |
| **Zoho Social API** | `publishers/social/zohoSocial.js` | Schedule/draft LLIF social posts | **Stub — not yet live** (OAuth token exchange throws) |
| **Anthropic API (Claude)** | `lib/llm.js` | LLM backbone for all 8 agents | `@anthropic-ai/sdk ^0.74.0` |
| **OpenAI API** | `lib/llm.js` (check-env requires both) | Alternate LLM option | `openai ^6.18.0` |
| **PostgreSQL** | `apps/portal/src/lib/db.ts` | Portal primary data store | Docker Compose or apt install |

> **PostHog:** No evidence found in repo — TBD (not found in repo).

---

## 7. Configuration — Required Environment Variables

### Root `.env` (agents / CLI / publishers)

| Variable | Used By | Purpose |
|----------|---------|---------|
| `ANTHROPIC_API_KEY` | `lib/llm.js`, all agents | Claude API key |
| `OPENAI_API_KEY` | `scripts/check-env.js` | OpenAI API key (checked on startup) |
| `WP_LLIF_STAGING_URL` | `lib/targetRegistry.js` → `publishers/web/wpElementorStaging.js` | LLIF WordPress staging base URL |
| `WP_LLIF_STAGING_USER` | `wpElementorStaging.js:38` | LLIF WP Basic Auth username |
| `WP_LLIF_STAGING_APP_PASSWORD` | `wpElementorStaging.js:38` | LLIF WP application password |
| `WP_BESTLIFE_STAGING_URL` | `lib/targetRegistry.js` | BestLife WordPress staging base URL |
| `WP_BESTLIFE_STAGING_USER` | `wpElementorStaging.js:38` | BestLife WP username |
| `WP_BESTLIFE_STAGING_APP_PASSWORD` | `wpElementorStaging.js:38` | BestLife WP application password |
| `ZOHO_SOCIAL_CLIENT_ID` | `publishers/social/zohoSocial.js:24` | Zoho Social OAuth2 (stub) |
| `ZOHO_SOCIAL_CLIENT_SECRET` | `zohoSocial.js:24` | Zoho Social OAuth2 (stub) |
| `ZOHO_SOCIAL_REFRESH_TOKEN` | `zohoSocial.js:24` | Zoho Social OAuth2 (stub) |
| `ZOHO_SOCIAL_ZSID` | `zohoSocial.js:24` | Zoho Social workspace ID |
| `ZOHO_SOCIAL_CHANNEL_{PLATFORM}` | `zohoSocial.js:83` | Override channel IDs per platform |

### Portal `.env.local` (apps/portal/)

| Variable | Used By | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | `apps/portal/src/lib/db.ts` | PostgreSQL connection string |
| `PORTAL_JWT_SECRET` | `apps/portal/src/lib/auth.ts:6` | JWT signing secret (CHANGE IN PRODUCTION) |
| `UPLOAD_DIR` | `apps/portal/src/lib/storage.ts:5` | Local file upload directory |
| `AGENTS_REPO_ROOT` | `apps/portal/src/lib/publishBridge.ts:6`, `targetRegistry.ts:4` | Path to repo root (default: `../../`) |
| `PORTAL_PUBLIC_URL` | `publish/run/[runId]/route.ts:481` | Public base URL for asset URLs in exports |
| `LLIF_WP_BASE_URL` | `apps/portal/src/lib/wp/wpClient.ts` | LLIF WP URL for design-locked publish |
| `LLIF_WP_USERNAME` | `wp/wpClient.ts` | LLIF WP username |
| `LLIF_WP_APP_PASSWORD` | `wp/wpClient.ts` | LLIF WP application password |
| `BLA_WP_BASE_URL` | `wp/wpClient.ts` | BestLife WP URL for design-locked publish |
| `BLA_WP_USERNAME` | `wp/wpClient.ts` | BestLife WP username |
| `BLA_WP_APP_PASSWORD` | `wp/wpClient.ts` | BestLife WP application password |
| `BLA_X_API_KEY` | `directPublisher.ts` | Twitter API key |
| `BLA_X_API_SECRET` | `directPublisher.ts` | Twitter API secret |
| `BLA_X_ACCESS_TOKEN` | `directPublisher.ts` | Twitter access token |
| `BLA_X_ACCESS_TOKEN_SECRET` | `directPublisher.ts` | Twitter access token secret |
| `BLA_LINKEDIN_CLIENT_ID` | `directPublisher.ts` | LinkedIn OAuth2 client ID |
| `BLA_LINKEDIN_CLIENT_SECRET` | `directPublisher.ts` | LinkedIn OAuth2 client secret |
| `BLA_LINKEDIN_ACCESS_TOKEN` | `directPublisher.ts` | LinkedIn access token (expires 60 days) |
| `BLA_LINKEDIN_PAGE_ID` | `directPublisher.ts` | LinkedIn company page ID |
| `BLA_FACEBOOK_APP_ID` | `directPublisher.ts` | Facebook app ID |
| `BLA_FACEBOOK_APP_SECRET` | `directPublisher.ts` | Facebook app secret |
| `BLA_FACEBOOK_PAGE_ACCESS_TOKEN` | `directPublisher.ts` | Facebook page access token |
| `BLA_FACEBOOK_PAGE_ID` | `directPublisher.ts` | Facebook page ID |
| `BLA_BLUESKY_HANDLE` | `.env.example:67` | BlueSky handle (assist pack only) |
| `BLA_BLUESKY_APP_PASSWORD` | `.env.example:68` | BlueSky app password (assist pack only) |

> Phase-2 / assist-pack-only (not yet integrated into live publish): `BLA_INSTAGRAM_*`, `BLA_THREADS_*`, `BLA_REDDIT_*`, `BLA_YOUTUBE_*`, `BLA_TIKTOK_*`

---

## 8. Data Model

### PostgreSQL (Prisma) — `apps/portal/prisma/schema.prisma`

```
User ──< Run ──< Artifact ──< Approval
                │            └──< PublishLog
                │            └──< ArtifactAsset >── Asset
                │            └──< PublishJob
                ├──< AgentExecution
                └──< Asset
Workspace ──< Project ──< Run
```

**Key models:**
- `User` — email, passwordHash (bcrypt), role (admin/editor/viewer)
- `Workspace` — top-level org container
- `Project` — belongs to workspace; has `targetRegistryKey` (legacy single) + `targetRegistryKeys[]` (multi-target)
- `Run` — a campaign or web refresh execution; belongs to project
- `Artifact` — a piece of content (web_page/social_post/blog_post); stored as `content: Text`
- `Asset` — uploaded file; `scope` = "run" or "project"; stored at `uploads/{slug}/{runId|_project_docs}/{filename}`
- `ArtifactAsset` — join table linking Assets to Artifacts with placement/binding metadata
- `Approval` — reviewer decision (approved/rejected/needs_changes) on an artifact
- `PublishLog` — immutable log of every publish attempt (destination + result JSON)
- `AgentExecution` — full record of agent input/output/duration; `inputFiles` JSON tracks attached reference docs
- `PublishJob` — BestLife social publish job; tracks per-channel results, assist pack path, status

### Migrations (applied in order)
1. `20260213174406_init` — base schema
2. `20260214220230_add_artifact_assets` — `ArtifactAsset` join table
3. `20260218182550_add_agent_executions` — `AgentExecution` model
4. `20260218193320_add_target_registry_keys` — `targetRegistryKeys[]` on Project
5. `20260218200916_add_project_scope_assets` — `scope` field on Asset, nullable `runId`
6. `20260219135156_add_publish_job` — `PublishJob` model, `PublishJobStatus` enum

### Target Registry JSON Files (`targets/`)

| File | Brand | Type | Env |
|------|-------|------|-----|
| `llif-staging.json` | LLIF | web | staging |
| `bestlife-staging.json` | BestLife | web | staging |
| `llif-social.json` | LLIF | social | staging |
| `bestlife-social.json` | BestLife | social | production |

Social targets have `channels: { channel_key: { label, publishMode, charLimit, ... } }` instead of `pages`.

### Flat-file stores
- `publish-log.jsonl` — repo root; written by CLI publishers
- `apps/portal/data/content-items.jsonl` — LLIF content items for Zoho export
- `uploads/{projectSlug}/_publish_jobs/{jobId}.json` — BestLife assist pack JSON
- `uploads/{projectSlug}/_publish_jobs/{jobId}.md` — BestLife assist pack Markdown

---

## 9. AuthN/AuthZ and Brand Boundaries

### Authentication
- **Mechanism:** JWT stored in HttpOnly cookie `portal_session` (1-day TTL)
- **Password hashing:** bcrypt (10 rounds) — `apps/portal/src/lib/auth.ts:10`
- **Session flow:** Login → `createToken(payload)` → cookie set → subsequent requests → `requireAuth()` → `getSession()` → DB lookup
- **Roles:** admin, editor, viewer (stored in User model; not yet enforced granularly beyond login)

### Brand Boundary Enforcement (LLIF ↔ BestLife)

**Layer 1 — Project creation:**
`apps/portal/src/app/api/workspaces/[workspaceId]/projects/route.ts` calls `validateBrandBoundary(targetRegistryKeys)` — returns 400 if the selected targets span multiple brands.

**Layer 2 — Publish routing:**
`apps/portal/src/app/api/publish/run/[runId]/route.ts:116` — `publishSocialPost()` checks brand:
- `brand === "BestLife"` → `publishBestLifeSocial()` (direct API + assist pack)
- `brand === "LLIF"` → LLIF/Zoho CSV path (unchanged)

**Layer 3 — BestLife publisher:**
`apps/portal/src/lib/publishers/bestlife/index.ts:30` — `validateBestLifePublish(brand, channels)`:
- Rejects any non-"bestlife" brand with `BRAND_MISMATCH`
- Rejects unknown channel keys with `UNKNOWN_CHANNELS`
- Rejects empty channel selection with `EMPTY_CHANNELS`

**Layer 4 — WP publisher staging guard:**
`publishers/web/wpElementorStaging.js:49` — `resolveSiteConfig()` rejects any URL that doesn't contain "staging", "stg-", or "stg." — prevents accidental live WP pushes.

**Layer 5 — Zoho Social guard:**
`publishers/social/zohoSocial.js:196-202` — Refuses live posting unless `artifact.human_approval === true`. Throws if Zoho OAuth2 is not configured.

---

## 10. Error Handling, Retries, Idempotency

### Error handling patterns:
- **Publish CLI** — `scripts/publish.js:284` — per-artifact try/catch; failed artifacts logged in summary table; exits with code 1 if any fail
- **WP publisher** — throws on HTTP errors; callers catch and log
- **BestLife direct publisher** — `directPublisher.ts` — returns `{ status: "failed", error: "..." }` instead of throwing (never throws); orchestrator uses `Promise.allSettled()`
- **Portal publish API** — `publishBridge.ts` — `execFile` with 30s timeout; returns `{ ok: false, stderr }` on failure
- **Agent gateway** — `agentGateway.ts:251` — catch block returns `{ ok: false, error }` without throwing

### Retries:
- **No automatic retries** anywhere in the codebase — all publish operations are fire-and-forget with no retry loop.

### Idempotency:
- **WP publish** — idempotent; WordPress `POST /wp-json/wp/v2/pages/{id}` is an upsert by page ID
- **BestLife social** — not idempotent; calling the API twice creates two posts. The `PublishJob` model prevents UI confusion by recording the result.
- **Zoho CSV export** — idempotent; generates a new CSV each time; no live API calls

---

## 11. Tests

### Test runner: `node:test` (built-in Node.js test runner)

### Portal tests (TypeScript, tsx runner):
```bash
cd apps/portal
npx tsx --test __tests__/*.test.ts
```

| Test file | What it covers |
|-----------|---------------|
| `__tests__/bestLifePublish.test.ts` | Channel registry, assist pack generator, brand guardrails, channel routing — 28 tests |
| `__tests__/designContract.test.ts` | Design-locked page template validation |
| `__tests__/templateRegistry.test.ts` | Template loading and registry |
| `__tests__/zohoExport.test.ts` | Zoho CSV export generation and formatting |

### Root tests (JavaScript):
```bash
npm test  # runs node --test 'marketing-artifacts/__tests__/*.test.js'
```

| Test file | What it covers |
|-----------|---------------|
| `marketing-artifacts/__tests__/validate.test.js` | AJV schema validation for all artifact types |
| `marketing-artifacts/__tests__/targetRegistry.test.js` | Registry loading, page key resolution, alias normalization |
| `marketing-artifacts/__tests__/markdownToHtml.test.js` | Markdown/HTML detection and conversion |
| `marketing-artifacts/__tests__/publisher-passthrough.test.js` | WP publisher dry-run behavior |
| `marketing-artifacts/__tests__/redditGuard.test.js` | Reddit content policy guard |

**Total: 83 tests, 0 failing** (as of 2026-02-19)

### What is NOT tested:
- Live API calls (WP, Twitter/X, LinkedIn, Facebook, Zoho Social)
- Portal UI components (no React testing library setup)
- Portal API routes (no integration test harness)
- Authentication flow

---

## 12. Deployment

### Local development
See [HOW_TO_GUIDE.md — Quick Start](HOW_TO_GUIDE.md#quick-start) for full steps.

```bash
# Start portal
cd apps/portal && npm run dev  # http://localhost:4000

# Start agents (each in its own terminal or use start:all)
npm run start:all              # starts all 8 Express servers

# OR start individual agents
npm run start:marketing-compiler  # port 3000
npm run start:editor              # port 3001
# ... etc.
```

### Production / office server
From `docs/portal-local-setup.md:107`:
```bash
cd apps/portal
docker compose up -d                    # Postgres
npm install
npx prisma migrate deploy               # apply migrations (no dev prompts)
npm run build                           # Next.js build
npm start                               # port 4000
```

Put behind nginx for TLS. No containerization for agent servers or portal beyond Postgres currently in repo.

### Environment files
- Root `.env` — LLM API keys + WP credentials + Zoho credentials. Copy from root `.env.example`.
- `apps/portal/.env.local` — DB URL + JWT secret + upload dir + Portal credentials. Copy from `apps/portal/.env.example`.

> **IMPORTANT:** Root `.env` is shared by both the CLI scripts and the portal (via `publishBridge.ts` which inherits `process.env`).

---

## 13. Gaps & TBDs

| Gap | Location | Notes |
|-----|----------|-------|
| Zoho Social OAuth2 not implemented | `publishers/social/zohoSocial.js:44-61` | Token refresh throws with "not yet integrated" message |
| Twitter/X OAuth 1.0a signing not implemented | `directPublisher.ts` — see TODOs | The `publishToX()` function has a TODO for signing; calls to X API likely fail without a real signing library |
| LLIF social channels (llif-social.json) not wired to any publisher | `targets/llif-social.json` | Registry exists but no code routes LLIF social_post artifacts to specific channel adapters |
| LinkedIn token refresh (60-day expiry) | `apps/portal/.env.example:44` | No automated refresh; operator must re-authenticate manually |
| Blog post publishing is a stub | `scripts/publish.js:132` | Returns `{ status: "not-implemented" }` |
| No automatic retries | All publisher adapters | First failure = failure; no exponential backoff |
| No test coverage for portal API routes | `apps/portal/src/app/api/` | Integration tests not present |
| No test coverage for portal UI | `apps/portal/src/components/` | No React Testing Library setup |
| Role-based access control (viewer vs editor) not enforced | `apps/portal/src/lib/auth.ts` | Role stored in DB but no per-route RBAC guards |
| `AGENTS_REPO_ROOT` must be set correctly in portal `.env` | `publishBridge.ts:6` | Defaults to `../../` which works when portal runs from `apps/portal/`. Misconfiguration breaks publish. |
| Design-locked publisher details | `apps/portal/src/lib/designContract/` | Directory exists but not fully documented here — TBD |
| PostHog analytics | N/A | No evidence in repo |
| Assist-pack channels (Instagram, Threads, BlueSky, Reddit, YouTube, TikTok) | `bestlife-social.json` | Assist pack generates posting guides but does NOT make live API calls; requires human to post manually |
