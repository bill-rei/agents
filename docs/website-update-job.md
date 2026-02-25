# Website Update Job

A **Website Update Job** is a multi-page publishing workflow that takes Web Renderer output,
maps each page to a WordPress staging slug, collects per-page approvals, and publishes all
approved pages as a single coordinated batch.

---

## Artifact Structure

All state lives in a single `Artifact` row (`type = "web_site_update"`).

| Field | Contents |
|---|---|
| `artifact.content` | Raw Web Renderer JSON output (preserved for traceability) |
| `artifact.target` | `{ siteKey: "llif-staging", brand: "llif" }` |
| `artifact.metadata` | Full job state (see below) |
| `artifact.status` | High-level Prisma status: `draft → review → approved → published` |

### `metadata` schema

```typescript
{
  brand: "llif" | "bestlife",
  siteKey: string,                  // e.g. "llif-staging"
  jobStatus: JobStatus,             // see below
  requireAllApproved: boolean,
  pages: WebJobPage[],
  feedbackPayload?: RefeedPayload,  // set by request-changes
}
```

### `WebJobPage`

```typescript
{
  source_key: string,        // stable ID (renderer slug or generated from title)
  title: string,
  targetSlug: string,        // editable WP slug — defaults to source_key
  body_html: string | null,
  body_markdown: string | null,
  // Approval
  approvalStatus: "pending" | "approved" | "rejected" | "needs_changes",
  approvalNotes: string | null,
  // WP lookup (filled by validate-slugs)
  wpPageId: number | null,
  wpPageExists: boolean | null,
  // Publish result (filled after publish)
  publishStatus: "ok" | "failed" | null,
  publishResult: { ok, wpPageId?, link?, status?, error? } | null,
}
```

### Job Status Lifecycle

```
DRAFT → IN_REVIEW → APPROVED → PUBLISHING → PUBLISHED
                                          ↘ FAILED
                                          ↘ PARTIAL_FAILED
```

---

## 4-Step Workflow (UI)

Navigate to any Run → **Website Job** tab.

| Step | Action |
|---|---|
| 1. Input | Paste Web Renderer JSON (or load from last execution). Select target site. |
| 2. Slug Mapping | Edit target slugs. Click **Validate Slugs** to check WP existence. Save. |
| 3. Review & Approve | Expand each page card to preview HTML. Approve individually or **Approve All**. |
| 4. Publish | Dry-run preview, then **Publish Job**. Retry failed pages without re-running others. |

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/artifacts/website-job` | Create job from renderer output |
| `GET` | `/api/artifacts/website-job/[id]` | Fetch full job state |
| `PATCH` | `/api/artifacts/website-job/[id]` | Update slug mapping / settings |
| `POST` | `/api/artifacts/website-job/[id]/validate-slugs` | WP slug lookup per page |
| `POST` | `/api/artifacts/website-job/[id]/pages/[key]/approve` | Per-page approval decision |
| `POST` | `/api/artifacts/website-job/[id]/approve-all` | Approve all pages at once |
| `POST` | `/api/artifacts/website-job/[id]/request-changes` | Generate refeed payload |
| `POST` | `/api/publish/website-job/[id]` | Batch publish approved pages |
| `GET` | `/api/targets?type=web` | List available web targets for site selector |

---

## Request Changes / Refeed

When pages need revision, click **Request Changes** in Section 3. The API generates a structured
JSON payload to paste directly into the Editor or Web Renderer agent input field:

```json
{
  "run_id": "...",
  "brand": "llif",
  "agent_suggestion": "web-renderer",
  "pages": [
    {
      "source_key": "home",
      "slug": "home",
      "current_html": "<h1>Current content</h1>",
      "feedback": "Tone is too formal, lighten it up"
    }
  ],
  "global_feedback": "Tone is too formal, lighten it up"
}
```

---

## Publish Logging

Every publish attempt appends a JSONL entry to `apps/portal/data/website-job-publish.jsonl`:

```json
{
  "timestamp": "2026-02-25T10:00:00.000Z",
  "artifact_id": "...",
  "run_id": "...",
  "site_key": "llif-staging",
  "job_status": "PUBLISHED",
  "pages_attempted": 3,
  "pages_ok": 3,
  "pages_failed": 0,
  "results": [...]
}
```

A `PublishLog` DB record is also created per publish attempt.

---

## Slug Rules

- Default `targetSlug` = renderer `slug` field, or `slugify(title)` if absent.
- All `targetSlug` values must be unique within a job (validated before save and on publish).
- Slugs not found in WP staging are created as new `draft` pages on publish.
- Slugs found in WP staging are updated in-place (content + title).
