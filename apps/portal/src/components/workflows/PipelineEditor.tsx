"use client";

import { useState, useEffect } from "react";
import type { AgentStepName } from "@/lib/types";
import { validatePipeline, availableSteps } from "@/lib/workflows";

const STEP_COLORS: Record<AgentStepName, string> = {
  Strategist: "border-indigo-200 bg-indigo-50 text-indigo-700",
  Compiler:   "border-blue-200 bg-blue-50 text-blue-700",
  Editor:     "border-violet-200 bg-violet-50 text-violet-700",
  Creative:   "border-pink-200 bg-pink-50 text-pink-700",
  Optimizer:  "border-amber-200 bg-amber-50 text-amber-700",
  Distributor:"border-emerald-200 bg-emerald-50 text-emerald-700",
};

const STEP_DESCRIPTIONS: Record<AgentStepName, string> = {
  Strategist:  "Analyzes idea + brand voice",
  Compiler:    "Generates copy variants",
  Editor:      "Reviews tone & compliance",
  Creative:    "Generates visual assets",
  Optimizer:   "A/B scoring + recommendations",
  Distributor: "Formats + distributes output",
};

interface PipelineEditorProps {
  initialSteps: AgentStepName[];
  onChange?: (steps: AgentStepName[], isValid: boolean) => void;
}

export default function PipelineEditor({ initialSteps, onChange }: PipelineEditorProps) {
  const [steps, setSteps] = useState<AgentStepName[]>(initialSteps);
  const [addStep, setAddStep] = useState<AgentStepName | "">("");

  const errors = validatePipeline(steps);
  const isValid = errors.length === 0;
  const available = availableSteps(steps);

  useEffect(() => {
    onChange?.(steps, isValid);
  }, [steps, isValid]); // eslint-disable-line react-hooks/exhaustive-deps

  function moveUp(i: number) {
    if (i === 0) return;
    const next = [...steps];
    [next[i - 1], next[i]] = [next[i], next[i - 1]];
    setSteps(next);
  }

  function moveDown(i: number) {
    if (i === steps.length - 1) return;
    const next = [...steps];
    [next[i], next[i + 1]] = [next[i + 1], next[i]];
    setSteps(next);
  }

  function remove(i: number) {
    setSteps(steps.filter((_, idx) => idx !== i));
  }

  function addStepToEnd() {
    if (!addStep) return;
    setSteps([...steps, addStep]);
    setAddStep("");
  }

  return (
    <div className="space-y-3">
      {/* Steps list */}
      <div className="space-y-2">
        {steps.length === 0 && (
          <p className="text-sm text-gray-400 italic text-center py-4 border-2 border-dashed border-gray-200 rounded-xl">
            No steps — add one below.
          </p>
        )}
        {steps.map((name, i) => (
          <div
            key={`${name}-${i}`}
            className={`flex items-center gap-3 border rounded-xl px-3 py-2.5 ${STEP_COLORS[name]}`}
          >
            {/* Reorder buttons */}
            <div className="flex flex-col gap-0.5">
              <button
                onClick={() => moveUp(i)}
                disabled={i === 0}
                className="text-xs opacity-40 hover:opacity-100 disabled:opacity-20 disabled:cursor-not-allowed leading-none"
                title="Move up"
              >
                ▲
              </button>
              <button
                onClick={() => moveDown(i)}
                disabled={i === steps.length - 1}
                className="text-xs opacity-40 hover:opacity-100 disabled:opacity-20 disabled:cursor-not-allowed leading-none"
                title="Move down"
              >
                ▼
              </button>
            </div>

            {/* Step info */}
            <div className="flex-1 min-w-0">
              <span className="font-semibold text-sm">{name}</span>
              <span className="text-xs opacity-60 ml-2">{STEP_DESCRIPTIONS[name]}</span>
            </div>

            {/* Position badge */}
            <span className="text-[10px] opacity-50 font-mono w-5 text-center">{i + 1}</span>

            {/* Remove */}
            <button
              onClick={() => remove(i)}
              className="text-xs opacity-40 hover:opacity-80 hover:text-red-600 transition-colors ml-1"
              title="Remove step"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* Validation errors */}
      {errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 space-y-1">
          {errors.map((e) => (
            <p key={e} className="text-xs text-red-700">
              ⚠ {e}
            </p>
          ))}
        </div>
      )}

      {/* Add step row */}
      {available.length > 0 ? (
        <div className="flex gap-2">
          <select
            value={addStep}
            onChange={(e) => setAddStep(e.target.value as AgentStepName | "")}
            className="flex-1 border border-gray-200 rounded-xl px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
          >
            <option value="">Add a step…</option>
            {available.map((s) => (
              <option key={s} value={s}>
                {s} — {STEP_DESCRIPTIONS[s]}
              </option>
            ))}
          </select>
          <button
            onClick={addStepToEnd}
            disabled={!addStep}
            className="px-4 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            + Add
          </button>
        </div>
      ) : (
        <p className="text-xs text-gray-400 text-center">All available steps are in the pipeline.</p>
      )}

      {/* Valid indicator */}
      {steps.length > 0 && isValid && (
        <p className="text-xs text-emerald-600 flex items-center gap-1">
          <span>✓</span> Pipeline order is valid
        </p>
      )}
    </div>
  );
}
