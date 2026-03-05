"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import type {
  WorkflowTemplate,
  WorkflowCategory,
  WorkflowBrandScope,
  Channel,
  AssetType,
  AgentStepName,
  PublishMode,
} from "@/lib/types";
import {
  WORKFLOW_CATEGORY_LABELS,
  WORKFLOW_CATEGORY_COLORS,
  ALL_CHANNELS,
  CHANNEL_LABELS,
  ALL_ASSET_TYPES,
  ASSET_TYPE_LABELS,
} from "@/lib/types";
import { validatePipeline } from "@/lib/workflows";
import PipelineEditor from "@/components/workflows/PipelineEditor";
import PipelinePreview from "@/components/workflows/PipelinePreview";

const BRAND_OPTIONS: { value: WorkflowBrandScope; label: string }[] = [
  { value: "LLIF", label: "LLIF only" },
  { value: "BestLife", label: "BestLife only" },
  { value: "Any", label: "Any brand" },
];

const CATEGORY_OPTIONS: WorkflowCategory[] = [
  "social", "blog", "campaign", "website", "custom",
];

const PUBLISH_OPTIONS: { value: PublishMode; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "now", label: "Publish Now" },
  { value: "schedule", label: "Schedule" },
];

function isNewTemplate(id: string) {
  return id === "new";
}

export default function WorkflowDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const isNew = isNewTemplate(params.id);

  const [template, setTemplate] = useState<WorkflowTemplate | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  // Editable form fields
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [brand, setBrand] = useState<WorkflowBrandScope>("Any");
  const [category, setCategory] = useState<WorkflowCategory>("custom");
  const [defaultPublishMode, setDefaultPublishMode] = useState<PublishMode>("draft");
  const [defaultChannels, setDefaultChannels] = useState<Channel[]>([]);
  const [defaultAssets, setDefaultAssets] = useState<AssetType[]>([]);
  const [pipelineSteps, setPipelineSteps] = useState<AgentStepName[]>([]);
  const [pipelineValid, setPipelineValid] = useState(true);

  const loadTemplate = useCallback(async () => {
    if (isNew) return;
    const res = await fetch(`/api/workflows/${params.id}`);
    if (!res.ok) { router.push("/workflows"); return; }
    const { template: t } = await res.json() as { template: WorkflowTemplate };
    setTemplate(t);
    setName(t.name);
    setDescription(t.description ?? "");
    setBrand(t.brand);
    setCategory(t.category);
    setDefaultPublishMode(t.defaultPublishMode ?? "draft");
    setDefaultChannels(t.defaultChannels ?? []);
    setDefaultAssets(t.defaultAssets ?? []);
    setPipelineSteps(t.pipeline.map((s) => s.name));
    setLoading(false);
  }, [params.id, isNew, router]);

  useEffect(() => { loadTemplate(); }, [loadTemplate]);

  function toggleChannel(ch: Channel) {
    setDefaultChannels((prev) =>
      prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]
    );
  }

  function toggleAsset(t: AssetType) {
    setDefaultAssets((prev) =>
      prev.includes(t) ? prev.filter((a) => a !== t) : [...prev, t]
    );
  }

  async function handleSave() {
    if (!name.trim()) { setError("Name is required."); return; }
    if (pipelineSteps.length === 0) { setError("Pipeline must have at least one step."); return; }
    const pipelineErrors = validatePipeline(pipelineSteps);
    if (pipelineErrors.length > 0) { setError(pipelineErrors.join(" ")); return; }
    setError("");
    setSaving(true);

    const payload = {
      name: name.trim(),
      description: description.trim() || undefined,
      brand,
      category,
      defaultPublishMode,
      defaultChannels,
      defaultAssets,
      pipeline: pipelineSteps,
    };

    let res: Response;
    if (isNew) {
      res = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const { template: t } = await res.json() as { template: WorkflowTemplate };
        setSaved(true);
        setTimeout(() => router.push(`/workflows/${t.id}`), 600);
      }
    } else {
      res = await fetch(`/api/workflows/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const { template: t } = await res.json() as { template: WorkflowTemplate };
        setTemplate(t);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    }

    if (!res.ok) {
      const { error: e } = await res.json().catch(() => ({ error: "Save failed" })) as { error: string };
      setError(e);
    }
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 text-gray-400">Loading…</div>
    );
  }

  const pipelineErrors = validatePipeline(pipelineSteps);
  const canSave = name.trim().length > 0 && pipelineSteps.length > 0 && pipelineValid;

  // Build preview AgentStep objects from pipelineSteps (for PipelinePreview)
  const previewSteps = pipelineSteps.map((n, i) => ({
    id: `prev_${i}`,
    name: n,
    state: "idle" as const,
  }));

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Back */}
      <Link
        href="/workflows"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-6"
      >
        ← Workflow Templates
      </Link>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {isNew ? "New Template" : (template?.name ?? "Edit Template")}
        </h1>
        {!isNew && template && (
          <span className="text-xs text-gray-400">
            Updated {new Date(template.updatedAt).toLocaleDateString()}
          </span>
        )}
      </div>

      <div className="space-y-6">
        {/* Basics */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
          <h2 className="font-semibold text-gray-900">Basics</h2>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. LinkedIn Only (LLIF)"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what this template generates…"
              rows={2}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Brand scope */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Brand Scope
              </label>
              <div className="space-y-1">
                {BRAND_OPTIONS.map((opt) => (
                  <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="brand"
                      value={opt.value}
                      checked={brand === opt.value}
                      onChange={() => setBrand(opt.value)}
                      className="accent-indigo-600"
                    />
                    <span className="text-sm text-gray-700">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Category */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Category
              </label>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORY_OPTIONS.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategory(cat)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                      category === cat
                        ? WORKFLOW_CATEGORY_COLORS[cat] + " border-transparent"
                        : "border-gray-200 text-gray-500 hover:border-gray-300"
                    }`}
                  >
                    {WORKFLOW_CATEGORY_LABELS[cat]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Defaults */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
          <h2 className="font-semibold text-gray-900">Defaults</h2>
          <p className="text-xs text-gray-500">
            Pre-fill values applied when this template is used. Users can override any of these per message.
          </p>

          {/* Default publish mode */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Default Publish Mode
            </label>
            <div className="flex gap-2">
              {PUBLISH_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setDefaultPublishMode(opt.value)}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                    defaultPublishMode === opt.value
                      ? "bg-gray-900 text-white border-gray-900"
                      : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Default channels */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Default Channels
            </label>
            <div className="flex flex-wrap gap-2">
              {ALL_CHANNELS.map((ch) => (
                <button
                  key={ch}
                  onClick={() => toggleChannel(ch)}
                  className={`py-1 px-3 rounded-full text-xs font-medium border transition-all ${
                    defaultChannels.includes(ch)
                      ? "bg-indigo-50 text-indigo-700 border-indigo-300"
                      : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
                  }`}
                >
                  {CHANNEL_LABELS[ch]}
                </button>
              ))}
            </div>
          </div>

          {/* Default asset types */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
              Default Asset Types
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {ALL_ASSET_TYPES.map((t) => (
                <label key={t} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={defaultAssets.includes(t)}
                    onChange={() => toggleAsset(t)}
                    className="rounded accent-indigo-600"
                  />
                  <span className="text-sm text-gray-700">{ASSET_TYPE_LABELS[t]}</span>
                </label>
              ))}
            </div>
          </div>
        </section>

        {/* Pipeline editor */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Pipeline</h2>
            {previewSteps.length > 0 && (
              <PipelinePreview steps={previewSteps} size="sm" />
            )}
          </div>
          <p className="text-xs text-gray-500">
            Define the ordered steps agents will run when this template is used.
          </p>

          <PipelineEditor
            initialSteps={pipelineSteps}
            onChange={(steps, valid) => {
              setPipelineSteps(steps);
              setPipelineValid(valid);
            }}
          />
        </section>

        {/* Error + Save */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={saving || !canSave}
            className={`flex-1 py-2.5 font-semibold rounded-xl text-sm transition-all ${
              saved
                ? "bg-green-600 text-white"
                : "bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:from-indigo-700 hover:to-violet-700 disabled:opacity-50 disabled:cursor-not-allowed"
            }`}
          >
            {saving ? "Saving…" : saved ? "Saved ✓" : isNew ? "Create Template" : "Save Template"}
          </button>
          <Link
            href="/workflows"
            className="px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm hover:bg-gray-50 transition-all"
          >
            Cancel
          </Link>
        </div>
      </div>
    </div>
  );
}
