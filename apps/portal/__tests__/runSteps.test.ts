/**
 * Integration test for RunStep storage.
 *
 * Tests the DB operations and API logic without spinning up an HTTP server.
 * Uses a real DB connection (same as all other portal integration tests).
 *
 * Framework: node:test
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "crypto";
import { db } from "../src/lib/db";
import { buildAgentOutputMarkdown } from "../src/lib/agentOutput/contract";
import { validateAgentOutputMarkdown } from "../src/lib/agentOutput/validate";

// ── Test fixtures ─────────────────────────────────────────────────────────────

const TEST_PREFIX = `test_steps_${Date.now()}`;

let workspaceId: string;
let projectId: string;
let userId: string;
let runId: string;

function makeMarkdown(agentName: string, runIdVal: string): string {
  return buildAgentOutputMarkdown({
    runId: runIdVal,
    agentName,
    toneMode: "work",
    brand: "llif",
    title: `Test Output from ${agentName}`,
    summary: "This is a test summary for integration testing.",
    inputs: "- Test input A\n- Test input B",
    outputs: "- Test output X\n- Test output Y",
    notes: "No real content — integration test fixture.",
    nextActions: `- Next agent should proceed normally.`,
    createdAt: new Date().toISOString(),
  });
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

before(async () => {
  // Create a minimal workspace → project → user → run for testing
  const ws = await db.workspace.create({
    data: { name: `${TEST_PREFIX} WS`, slug: `${TEST_PREFIX}-ws` },
  });
  workspaceId = ws.id;

  const proj = await db.project.create({
    data: {
      workspaceId,
      name: `${TEST_PREFIX} Project`,
      slug: `${TEST_PREFIX}-proj`,
      targetRegistryKey: "test",
    },
  });
  projectId = proj.id;

  const user = await db.user.create({
    data: {
      email: `${TEST_PREFIX}@test.local`,
      name: "Test User",
      role: "admin",
    },
  });
  userId = user.id;

  const run = await db.run.create({
    data: {
      projectId,
      workflowKey: "campaign",
      createdByUserId: userId,
    },
  });
  runId = run.id;
});

after(async () => {
  // Clean up in FK order
  await db.runStep.deleteMany({ where: { runId } });
  await db.run.delete({ where: { id: runId } });
  await db.user.delete({ where: { id: userId } });
  await db.project.delete({ where: { id: projectId } });
  await db.workspace.delete({ where: { id: workspaceId } });
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("RunStep storage — create and retrieve", () => {
  let stepId: string;
  const markdownOutput = makeMarkdown("strategist", "fake-run-id");

  it("creates a RunStep record with correct fields", async () => {
    const validation = validateAgentOutputMarkdown(markdownOutput);
    const hash = createHash("sha256").update(markdownOutput).digest("hex").slice(0, 16);

    const step = await db.runStep.create({
      data: {
        runId,
        step: "strategist",
        status: validation.ok ? "ok" : "invalid",
        markdownOutput,
        jsonPayload: { agentKey: "strategist", durationMs: 1200 },
        validationErrors: validation.errors,
        validationWarnings: validation.warnings,
        hash,
      },
    });

    stepId = step.id;

    assert.ok(step.id, "Should have an id");
    assert.strictEqual(step.runId, runId);
    assert.strictEqual(step.step, "strategist");
    assert.strictEqual(step.status, "ok", `Expected ok, got: ${step.status}. Errors: ${validation.errors.join(", ")}`);
    assert.strictEqual(step.hash, hash);
    assert.deepStrictEqual(step.validationErrors, []);
  });

  it("retrieves the step by runId + step key", async () => {
    const found = await db.runStep.findFirst({
      where: { runId, step: "strategist" },
      orderBy: { createdAt: "desc" },
    });

    assert.ok(found, "Should find the step");
    assert.strictEqual(found!.id, stepId);
    assert.strictEqual(found!.markdownOutput, markdownOutput);
  });

  it("hash matches sha256[:16] of markdownOutput", async () => {
    const found = await db.runStep.findUnique({ where: { id: stepId } });
    const expected = createHash("sha256")
      .update(found!.markdownOutput ?? "")
      .digest("hex")
      .slice(0, 16);
    assert.strictEqual(found!.hash, expected);
  });

  it("lists all steps for the run", async () => {
    // Add a second step
    const md2 = makeMarkdown("marketing-compiler", "fake-run-id");
    await db.runStep.create({
      data: {
        runId,
        step: "marketing-compiler",
        status: "ok",
        markdownOutput: md2,
        jsonPayload: { agentKey: "marketing-compiler" },
        hash: createHash("sha256").update(md2).digest("hex").slice(0, 16),
      },
    });

    const steps = await db.runStep.findMany({
      where: { runId },
      orderBy: { createdAt: "asc" },
    });

    assert.ok(steps.length >= 2, `Should have at least 2 steps, got ${steps.length}`);
    assert.ok(steps.some((s) => s.step === "strategist"));
    assert.ok(steps.some((s) => s.step === "marketing-compiler"));
  });

  it("stores invalid step with validation errors", async () => {
    const badMarkdown = "# No frontmatter here\n## Summary\nfoo";
    const validation = validateAgentOutputMarkdown(badMarkdown);
    assert.ok(!validation.ok, "Fixture should be invalid");

    const step = await db.runStep.create({
      data: {
        runId,
        step: "editor",
        status: "invalid",
        markdownOutput: badMarkdown,
        jsonPayload: {},
        validationErrors: validation.errors,
        validationWarnings: validation.warnings,
        hash: null,
      },
    });

    assert.strictEqual(step.status, "invalid");
    assert.ok(step.validationErrors.length > 0, "Should have validation errors stored");
    assert.ok(
      step.validationErrors.some((e) => e.includes("frontmatter")),
      `Expected frontmatter error, got: ${step.validationErrors.join(", ")}`
    );
  });

  it("supports input_step_id linking for step chain", async () => {
    const parentStep = await db.runStep.findFirst({
      where: { runId, step: "strategist" },
    });
    assert.ok(parentStep, "Parent step should exist");

    const childMd = makeMarkdown("marketing-compiler", "fake-run-id-2");
    const child = await db.runStep.create({
      data: {
        runId,
        step: "marketing-compiler-linked",
        status: "ok",
        markdownOutput: childMd,
        jsonPayload: {},
        inputStepId: parentStep!.id,
        hash: createHash("sha256").update(childMd).digest("hex").slice(0, 16),
      },
    });

    assert.strictEqual(child.inputStepId, parentStep!.id);

    // Navigate the chain
    const chain = await db.runStep.findUnique({
      where: { id: child.id },
      include: { inputStep: true },
    });
    assert.strictEqual(chain!.inputStep!.step, "strategist");
  });

  it("markdown round-trips through DB without corruption", async () => {
    const original = makeMarkdown("distributor", "trip-test");
    const step = await db.runStep.create({
      data: {
        runId,
        step: "distributor-roundtrip",
        status: "ok",
        markdownOutput: original,
        jsonPayload: {},
        hash: createHash("sha256").update(original).digest("hex").slice(0, 16),
      },
    });

    const fetched = await db.runStep.findUnique({ where: { id: step.id } });
    assert.strictEqual(fetched!.markdownOutput, original, "Markdown should survive DB round-trip");
  });
});
