/**
 * Manual integration test: verify marketingOpsConfig flows through the API route
 * into executeAgent and is injected into the agent call.
 *
 * Usage:
 *   npm run test:marketing-config
 *
 * Prerequisites:
 *   - Portal dev server running on http://localhost:4000  (npm run dev)
 *   - At least one Run record in the database
 *   - A valid session cookie, OR run the script server-side with direct DB access
 *     (the route calls requireAuth() — see NOTE below about auth)
 *
 * NOTE ON AUTH:
 *   The /execute route requires a logged-in session. This script uses
 *   fetch() with `credentials: "include"`, but Node fetch doesn't share browser
 *   cookies. Two options:
 *
 *   Option A (easiest for dev): temporarily comment out `requireAuth()` in the
 *   route while testing, then restore it.
 *
 *   Option B: export a signed JWT from your session and set it here:
 *     const SESSION_COOKIE = "next-auth.session-token=<value>";
 *   Then uncomment the Cookie header below.
 */

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

// Optionally set a session cookie (Option B above)
const SESSION_COOKIE = process.env.SESSION_COOKIE ?? "";

const BASE_URL = process.env.PORTAL_URL ?? "http://localhost:4000";
const AGENT_KEY = "marketing-compiler";

async function main() {
  // ── 1. Find the most recent Run ────────────────────────────────────────────
  const run = await db.run.findFirst({
    orderBy: { createdAt: "desc" },
    select: { id: true, workflowKey: true, status: true, createdAt: true },
  });

  if (!run) {
    console.error(
      "ERROR: No Run records found in the database.\n" +
        "Create a run via the portal UI first, then re-run this script."
    );
    process.exit(1);
  }

  console.log(`Using run: ${run.id} — workflow: ${run.workflowKey}, status: ${run.status} (${run.createdAt.toISOString()})`);

  // ── 2. Build request body ──────────────────────────────────────────────────
  const requestBody = {
    runId: run.id,
    inputs: {
      campaignTitle: "Config Injection Test",
    },
    marketingOpsConfig: {
      brandMode: "BestLife",
      phaseMode: 3,
    },
  };

  console.log("\nPOST body:");
  console.log(JSON.stringify(requestBody, null, 2));

  // ── 3. Call the execute endpoint ───────────────────────────────────────────
  const url = `${BASE_URL}/api/agents/${AGENT_KEY}/execute`;
  console.log(`\nPOST ${url}`);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (SESSION_COOKIE) {
    headers["Cookie"] = SESSION_COOKIE;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody),
  });

  // ── 4. Print result ────────────────────────────────────────────────────────
  console.log(`\nHTTP status: ${response.status} ${response.statusText}`);

  let json: unknown;
  const text = await response.text();
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }

  console.log("\nResponse JSON:");
  console.log(JSON.stringify(json, null, 2));

  // ── 5. Surface key fields ──────────────────────────────────────────────────
  if (response.ok && json && typeof json === "object") {
    const r = json as Record<string, unknown>;
    const inputs = r.inputs as Record<string, unknown> | undefined;

    console.log("\n── Verification ──────────────────────────────────────────");
    if (inputs) {
      const mopsRaw = inputs["_marketingOpsConfig"];
      if (mopsRaw) {
        console.log("✓ _marketingOpsConfig persisted to execution inputs:");
        try {
          console.log(JSON.stringify(JSON.parse(mopsRaw as string), null, 2));
        } catch {
          console.log(mopsRaw);
        }
      } else {
        console.warn("⚠ _marketingOpsConfig not found in execution inputs");
      }

      const provider = inputs["_providerId"];
      if (provider) console.log(`✓ _providerId: ${provider}`);
    } else {
      console.warn("⚠ inputs field not present in response (may be omitted in serialization)");
    }

    console.log(`✓ Execution status: ${r.status}`);
    if (r.error) console.warn(`⚠ Agent error: ${r.error}`);
  } else if (!response.ok) {
    console.error("\n✗ Request failed — check that:");
    console.error("  1. The portal dev server is running on", BASE_URL);
    console.error("  2. You have a valid session (see NOTE ON AUTH in this script)");
    console.error("  3. The run ID exists:", run.id);
  }
}

main()
  .catch((err) => {
    console.error("Unhandled error:", err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
