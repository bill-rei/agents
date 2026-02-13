# Marketing Ops Portal — Local Setup

## Prerequisites

- Node.js 18+
- Docker (for Postgres)

## 1. Start Postgres

```bash
cd apps/portal
docker compose up -d
```

This starts Postgres 16 on port **5433** (to avoid conflicts with any system Postgres). Database: `portal`, user: `portal`, password: `portal_dev`.

## 2. Configure environment

```bash
cp .env.example .env.local
```

The defaults work with the docker-compose setup. Edit `PORTAL_JWT_SECRET` for production. The `UPLOAD_DIR` defaults to `./uploads` (relative to `apps/portal/`).

## 3. Install dependencies

```bash
npm install
```

## 4. Run database migration

```bash
npx prisma migrate dev --name init
```

## 5. Seed the database

```bash
npx prisma db seed
```

Creates:
- Admin user: `admin@portal.local` / `admin123`
- Two example workspaces: "Brand Alpha", "Brand Beta"
- One project: "Website Refresh" linked to the `llif-staging` target registry

## 6. Start the portal

```bash
npm run dev
```

Opens at **http://localhost:4000**.

Or from the repo root:
```bash
npm run start:portal
```

## How it works

### Uploads

Files are saved to `UPLOAD_DIR/<projectSlug>/<runId>/<filename>`. Default: `apps/portal/uploads/`. This directory is gitignored.

To swap to S3 later, replace the functions in `src/lib/storage.ts`.

### Creating a workspace + project + run

1. Log in at `/login` with `admin@portal.local` / `admin123`
2. Go to **Workspaces** → create a workspace (or use seeded ones)
3. Click into a workspace → create a **Project**, selecting a target registry key from the dropdown (these come from `targets/*.json` in the repo root)
4. Go to **Runs** → **New Run** → select workspace, project, and workflow type
5. Inside the run:
   - **Assets** tab: upload files (images, docs) with optional tags
   - **Artifacts** tab: create/edit artifacts (web_page, social_post, blog_post) with JSON content
   - **Review** tab: approve, reject, or request changes on artifacts
   - **Publish** tab: publish approved artifacts (dry-run first, then apply)

### Publishing

The portal shells out to the existing `scripts/publish.js` CLI. This means:

- The root `.env` must have publisher credentials configured (WP staging creds, Zoho, X, LinkedIn — see root `.env.example`)
- The portal's own `.env.local` only needs Postgres + JWT config
- Publishing uses `--dry-run` by default. Uncheck "Dry run" to actually push

The portal writes a temporary artifact JSON file, calls `node scripts/publish.js --file <tmp> --apply --site <registryKey>`, captures the output, and stores a PublishLog row.

### Target registry

Projects reference a `targetRegistryKey` (e.g., `llif-staging`, `bestlife-staging`). This maps to `targets/<key>.json` in the repo root. When publishing a `web_page` artifact, the publish CLI resolves the page slug from the registry.

To add a new site, create `targets/<site-key>.json` and add credentials to the root `.env`.

### Database management

```bash
# Open Prisma Studio (GUI for browsing data)
npm run db:studio

# Create a new migration after schema changes
npm run db:migrate
```

### Deploying on an office server

1. Install Docker + Node.js on the server
2. Clone the repo, configure `.env` files
3. `cd apps/portal && docker compose up -d && npm install && npx prisma migrate deploy && npm run build && npm start`
4. Portal runs on port 4000. Put behind nginx for TLS if needed.
