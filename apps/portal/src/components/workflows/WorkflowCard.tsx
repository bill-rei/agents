"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { WorkflowTemplate } from "@/lib/types";
import {
  WORKFLOW_CATEGORY_LABELS,
  WORKFLOW_CATEGORY_COLORS,
  ASSET_TYPE_LABELS,
  CHANNEL_LABELS,
} from "@/lib/types";
import PipelinePreview from "./PipelinePreview";

const BRAND_BADGE = {
  LLIF: "bg-indigo-100 text-indigo-700",
  BestLife: "bg-emerald-100 text-emerald-700",
  Any: "bg-gray-100 text-gray-600",
};

interface WorkflowCardProps {
  template: WorkflowTemplate;
  /** If provided, "Use" redirects to /create with query params instead of creating a message */
  useHref?: string;
  onUse?: (template: WorkflowTemplate) => void;
}

export default function WorkflowCard({ template, onUse }: WorkflowCardProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  async function handleUse() {
    if (onUse) {
      onUse(template);
      return;
    }
    // Default: navigate to /create with template pre-selected via query param
    startTransition(() => {
      router.push(`/create?templateId=${template.id}`);
    });
  }

  const channels = template.defaultChannels ?? [];
  const assets = template.defaultAssets ?? [];

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide ${WORKFLOW_CATEGORY_COLORS[template.category]}`}
            >
              {WORKFLOW_CATEGORY_LABELS[template.category]}
            </span>
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${BRAND_BADGE[template.brand]}`}
            >
              {template.brand}
            </span>
          </div>
          <h3 className="font-semibold text-gray-900 text-sm">{template.name}</h3>
          {template.description && (
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
              {template.description}
            </p>
          )}
        </div>
      </div>

      {/* Pipeline */}
      <div>
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
          Pipeline
        </p>
        <PipelinePreview steps={template.pipeline} size="sm" />
      </div>

      {/* Meta: channels + assets */}
      {(channels.length > 0 || assets.length > 0) && (
        <div className="text-xs text-gray-400 space-y-0.5">
          {channels.length > 0 && (
            <p>
              <span className="font-medium text-gray-500">Channels: </span>
              {channels.map((c) => CHANNEL_LABELS[c]).join(", ")}
            </p>
          )}
          {assets.length > 0 && (
            <p>
              <span className="font-medium text-gray-500">Generates: </span>
              {assets.map((a) => ASSET_TYPE_LABELS[a]).join(", ")}
            </p>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1 border-t border-gray-50">
        <button
          onClick={handleUse}
          disabled={pending}
          className="flex-1 py-1.5 text-sm font-semibold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-all"
        >
          {pending ? "…" : "Use"}
        </button>
        <Link
          href={`/workflows/${template.id}`}
          className="py-1.5 px-4 text-sm border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 transition-all"
        >
          Edit
        </Link>
      </div>
    </div>
  );
}
