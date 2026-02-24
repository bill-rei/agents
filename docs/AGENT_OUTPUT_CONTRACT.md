# Agent Output Markdown Contract

All agent-to-agent handoffs in this pipeline must produce a single, valid Markdown document conforming to this contract. The contract is enforced at runtime: every time an agent executes, its output is validated and the result is stored as a `RunStep` record viewable in the portal.

---

## Example

```markdown
---
run_id: "run_2026_02_24_001"
agent_name: "strategist"
tone_mode: "work"
brand: "llif"
created_at: "2026-02-24T13:05:22.123Z"
output_format: "markdown"
---

# Campaign Strategy: Sleep Score Sneak Peek

## Summary
Define the campaign objective and audience for the Sleep Score feature launch.

## Inputs
- Feature: Sleep Score
- Channel targets: Website, X, LinkedIn, Reddit
- GTM priority: Phase 1 — privacy-first narrative

## Outputs
- Primary message: "Your sleep, finally in context"
- CTA: "See your Sleep Score"
- Required assets: hero image, 3× social posts, 1× blog post

## Notes
- Avoid roadmap leakage beyond Phase 1.
- Keep privacy framing structural, not defensive.

## Next Actions
- Compiler: generate drafts per channel using this strategy.
- Use persona: Health-aware professional, 30–45, iOS user.
```

---

## Schema

### Frontmatter (YAML between `---` delimiters)

| Field | Required | Description |
|---|---|---|
| `run_id` | ✅ | The portal Run ID for this execution |
| `agent_name` | ✅ | Agent key: `strategist`, `marketing-compiler`, `editor`, `distributor`, `optimizer`, `site-auditor`, `website-messaging-architect` |
| `tone_mode` | ✅ | `work` \| `neutral` \| `lighthearted` \| `hybrid` |
| `brand` | ✅ | `llif` \| `bestlife` \| `dual` |
| `created_at` | ✅ | ISO 8601 datetime: `2026-02-24T13:05:22.123Z` |
| `step` | optional | Same as `agent_name` |
| `inputs_ref` | optional | Filename or pointer to input artifact |
| `output_format` | optional | Always `"markdown"` |

### Body Sections

Sections must appear **exactly once, in this exact order**:

1. `## Summary` — 1–3 sentence overview of what this step produced
2. `## Inputs` — Bullet list or table of inputs received
3. `## Outputs` — The primary deliverables (in Markdown, never HTML)
4. `## Notes` — Caveats, flags, missing information, open questions
5. `## Next Actions` — Specific instructions for the next agent in the pipeline

### H1 Heading

- **Exactly one H1** must appear after the frontmatter: `# <Descriptive Title>`
- No additional `#` headings are permitted (H2–H6 are fine within sections)

---

## Contract Rules

| Rule | Description |
|---|---|
| Single H1 | Exactly one `# Title` in the body. No extras. |
| Five H2 sections | All five required sections, once each, in order. |
| No raw HTML | `<div>`, `<p>`, `<br>`, `<h1>`, `<span>`, etc. are forbidden outside code fences. |
| HTML in fences OK | `\`\`\`html ... \`\`\`` blocks may contain HTML examples. |
| Inline code OK | `` `<div>` `` in text is allowed (inline code is exempt). |
| Markdown links OK | `[text](url)` and `<https://url>` auto-links are allowed. |
| ISO created_at | `created_at` must parse as an ISO 8601 datetime. |
| No MD→HTML early | HTML conversion happens ONLY in `web-renderer` / the WP publisher. |

---

## Enforcement

### Validation

Every agent execution runs `validateAgentOutputMarkdown()` from:

```
apps/portal/src/lib/agentOutput/validate.ts
```

- **`ok`** — output stored with status `ok`
- **`invalid`** — output stored with status `invalid` + error list; execution is marked invalid in the UI
- **`error`** — agent call failed entirely; stored with status `error`

### Storage

Each execution creates a `RunStep` row in the `run_steps` DB table:

```
run_id, step, status, markdown_output, json_payload,
validation_errors[], validation_warnings[], hash (sha256[:16])
```

### HTML Conversion Boundary

Only `web-renderer` converts Markdown → HTML. It also rejects input that is already HTML (prevents double-conversion). All other agents must output pure Markdown.

---

## Helper Functions

```typescript
import { buildAgentOutputMarkdown, parseAgentOutputMarkdown } from "@/lib/agentOutput/contract";
import { validateAgentOutputMarkdown, assertValidAgentOutputMarkdown, normalizeAgentOutputMarkdown } from "@/lib/agentOutput/validate";

// Build a valid document
const md = buildAgentOutputMarkdown({ runId, agentName, toneMode, brand, title, summary, inputs, outputs, notes, nextActions });

// Parse it back
const parsed = parseAgentOutputMarkdown(md);
// → { frontmatter, title, sections, raw }

// Validate
const { ok, errors, warnings, parsed } = validateAgentOutputMarkdown(md);

// Validate or throw
const parsed = assertValidAgentOutputMarkdown(md); // throws on failure

// Normalize whitespace
const clean = normalizeAgentOutputMarkdown(md);
```

---

## Viewing Outputs in the Portal

1. Go to a Run in the portal: `/runs/<runId>/steps`
2. The **Steps** tab shows a vertical timeline of all agent executions for this run
3. Click any step to open the Step Inspector:
   - **Markdown** tab — raw Markdown (with Copy button)
   - **Rendered** tab — HTML preview of the Markdown
   - **Raw JSON** tab — the agent's input payload (with Download button)
   - **Validation** tab — errors, warnings, and parsed frontmatter

---

## Running Tests

```bash
# All portal tests (123 tests)
cd apps/portal && npm test

# Validator unit tests only (33 tests)
npm run test:unit

# Step storage integration tests only (7 tests, requires DB)
npm run test:integration
```
