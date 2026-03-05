"use client";

import Link from "next/link";
import type { WorkflowTemplate, Brand } from "@/lib/types";
import { WORKFLOW_CATEGORY_LABELS } from "@/lib/types";
import PipelinePreview from "./PipelinePreview";

interface TemplateSelectorProps {
  templates: WorkflowTemplate[];
  selectedId: string | null;
  brand: Brand;
  onChange: (template: WorkflowTemplate | null) => void;
  /** If set, only shows templates compatible with this brand */
  filterBrand?: boolean;
  showPreview?: boolean;
}

export default function TemplateSelector({
  templates,
  selectedId,
  brand,
  onChange,
  filterBrand = true,
  showPreview = true,
}: TemplateSelectorProps) {
  const compatible = filterBrand
    ? templates.filter((t) => t.brand === brand || t.brand === "Any")
    : templates;

  const selected = compatible.find((t) => t.id === selectedId) ?? null;

  function handleChange(value: string) {
    if (value === "") {
      onChange(null);
    } else {
      onChange(compatible.find((t) => t.id === value) ?? null);
    }
  }

  return (
    <div className="space-y-2">
      <select
        value={selectedId ?? ""}
        onChange={(e) => handleChange(e.target.value)}
        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
      >
        <option value="">Auto (recommended)</option>
        <optgroup label="Templates">
          {compatible.map((t) => (
            <option key={t.id} value={t.id}>
              {WORKFLOW_CATEGORY_LABELS[t.category]} · {t.name}
            </option>
          ))}
        </optgroup>
      </select>

      {/* Preview of selected template */}
      {showPreview && selected && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2.5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-indigo-700">{selected.name}</span>
            <Link
              href={`/workflows/${selected.id}`}
              className="text-[10px] text-indigo-500 hover:underline"
            >
              View template →
            </Link>
          </div>
          {selected.description && (
            <p className="text-xs text-indigo-600">{selected.description}</p>
          )}
          <PipelinePreview steps={selected.pipeline} size="sm" />
        </div>
      )}
    </div>
  );
}
