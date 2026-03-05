/**
 * Workflow pipeline utilities: validation rules + auto-select heuristic.
 */
import type { AgentStepName, Channel, Brand, WorkflowTemplate } from "./types";
import { listWorkflowTemplates } from "./mock";

// ── Pipeline validation ───────────────────────────────────────────────────────

/**
 * Validates a pipeline (ordered list of step names) against the ordering rules:
 * - No duplicate steps.
 * - Strategist must be first if included.
 * - Distributor must be last if included.
 * - Optimizer must be last, or second-to-last immediately before Distributor.
 *
 * Returns an array of error strings (empty = valid).
 */
export function validatePipeline(steps: AgentStepName[]): string[] {
  const errors: string[] = [];

  if (steps.length === 0) {
    errors.push("Pipeline must have at least one step.");
    return errors;
  }

  // No duplicates
  if (new Set(steps).size !== steps.length) {
    errors.push("Pipeline cannot contain duplicate steps.");
  }

  const si = steps.indexOf("Strategist");
  if (si > 0) {
    errors.push("Strategist must be the first step if included.");
  }

  const di = steps.indexOf("Distributor");
  if (di !== -1 && di !== steps.length - 1) {
    errors.push("Distributor must be the last step if included.");
  }

  const oi = steps.indexOf("Optimizer");
  if (oi !== -1) {
    const isLast = oi === steps.length - 1;
    const isBeforeDistributor = di !== -1 && oi === di - 1;
    if (!isLast && !isBeforeDistributor) {
      errors.push("Optimizer must be last, or second-to-last immediately before Distributor.");
    }
  }

  return errors;
}

export function isPipelineValid(steps: AgentStepName[]): boolean {
  return validatePipeline(steps).length === 0;
}

// ── Auto-select heuristic ─────────────────────────────────────────────────────

/**
 * Picks the best-matching workflow template for the given channels + brand.
 * Returns null if no clear match (callers should proceed without a template).
 *
 * Rules (priority order):
 * 1. website_git in channels → website category
 * 2. 3+ channels → campaign category
 * 3. community in channels → blog category
 * 4. linkedin or x (single-channel) → social category matching brand
 * 5. fallback: null
 */
export function autoSelectWorkflow(
  channels: Channel[],
  brand: Brand
): WorkflowTemplate | null {
  if (channels.length === 0) return null;

  const templates = listWorkflowTemplates();

  // Filter compatible brand (brand matches or template brand is "Any")
  const compatible = templates.filter(
    (t) => t.brand === brand || t.brand === "Any"
  );

  const byCategory = (cat: WorkflowTemplate["category"]) =>
    compatible.find((t) => t.category === cat) ?? null;

  if (channels.includes("website_git")) return byCategory("website");
  if (channels.length >= 3) return byCategory("campaign");
  if (channels.includes("community")) return byCategory("blog");

  // Social: single-channel linkedin or x
  if (channels.length === 1 && (channels[0] === "linkedin" || channels[0] === "x")) {
    // Prefer brand-exact match first
    const exact = compatible.find(
      (t) => t.category === "social" && t.brand === brand
    );
    return exact ?? byCategory("social");
  }

  return null;
}

// ── Available steps helper (for "Add step" dropdown) ─────────────────────────

/** Returns step names not already in the pipeline (for "Add step" UI). */
export function availableSteps(currentSteps: AgentStepName[]): AgentStepName[] {
  const all: AgentStepName[] = [
    "Strategist",
    "Compiler",
    "Editor",
    "Creative",
    "Optimizer",
    "Distributor",
  ];
  return all.filter((s) => !currentSteps.includes(s));
}
