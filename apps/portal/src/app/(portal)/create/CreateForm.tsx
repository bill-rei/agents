"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  Brand,
  Channel,
  PublishMode,
  AssetType,
  WorkflowTemplate,
  AgentStepName,
} from "@/lib/types";
import {
  ALL_CHANNELS,
  CHANNEL_LABELS,
  ASSET_TYPE_LABELS,
  ALL_ASSET_TYPES,
} from "@/lib/types";
import TemplateSelector from "@/components/workflows/TemplateSelector";
import PipelinePreview from "@/components/workflows/PipelinePreview";

interface CreateFormProps {
  templates: WorkflowTemplate[];
}

const PIPELINE_DESCRIPTIONS: Record<AgentStepName, string> = {
  Strategist:  "Analyzes your idea and brand voice",
  Compiler:    "Generates copy variants for each channel",
  Editor:      "Reviews tone, clarity, and compliance",
  Creative:    "Generates visual assets",
  Distributor: "Formats output for each platform",
  Optimizer:   "A/B variant scoring and recommendations",
};

const DEFAULT_PIPELINE_STEPS: AgentStepName[] = [
  "Strategist", "Compiler", "Editor", "Creative", "Distributor", "Optimizer",
];

export default function CreateForm({ templates }: CreateFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  // Determine initial template from URL param ?templateId=...
  const urlTemplateId = searchParams.get("templateId");
  const initialTemplate = urlTemplateId
    ? templates.find((t) => t.id === urlTemplateId) ?? null
    : null;

  // Form state — initialized from template if provided
  const [idea, setIdea] = useState("");
  const [brand, setBrand] = useState<Brand>("LLIF");
  const [channels, setChannels] = useState<Channel[]>(
    initialTemplate?.defaultChannels?.length ? initialTemplate.defaultChannels : ["linkedin", "x"]
  );
  const [publishMode, setPublishMode] = useState<PublishMode>(
    initialTemplate?.defaultPublishMode ?? "draft"
  );
  const [scheduledFor, setScheduledFor] = useState("");
  const [selectedAssets, setSelectedAssets] = useState<AssetType[]>(
    initialTemplate?.defaultAssets?.length ? initialTemplate.defaultAssets : []
  );
  const [useCustomAssets, setUseCustomAssets] = useState(
    !!(initialTemplate?.defaultAssets?.length)
  );
  const [selectedTemplate, setSelectedTemplate] = useState<WorkflowTemplate | null>(
    initialTemplate
  );
  const [error, setError] = useState("");

  function applyTemplate(tmpl: WorkflowTemplate | null) {
    setSelectedTemplate(tmpl);
    if (tmpl) {
      if (tmpl.defaultChannels?.length) setChannels(tmpl.defaultChannels);
      if (tmpl.defaultPublishMode) setPublishMode(tmpl.defaultPublishMode);
      if (tmpl.defaultAssets?.length) {
        setSelectedAssets(tmpl.defaultAssets);
        setUseCustomAssets(true);
      }
    }
  }

  function toggleChannel(ch: Channel) {
    setChannels((prev) =>
      prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]
    );
  }

  function toggleAsset(t: AssetType) {
    setSelectedAssets((prev) =>
      prev.includes(t) ? prev.filter((a) => a !== t) : [...prev, t]
    );
  }

  async function handleCreate() {
    if (!idea.trim()) { setError("Please describe your message idea."); return; }
    if (channels.length === 0) { setError("Select at least one channel."); return; }
    if (useCustomAssets && selectedAssets.length === 0) {
      setError("Select at least one asset type, or disable custom selection.");
      return;
    }
    setError("");

    const res = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        idea,
        brand,
        channels,
        publishMode,
        scheduledFor: scheduledFor || undefined,
        assetTypes: useCustomAssets ? selectedAssets : undefined,
        templateId: selectedTemplate?.id,
      }),
    });

    if (!res.ok) { setError("Failed to create message."); return; }
    const { id } = await res.json() as { id: string };
    startTransition(() => router.push(`/messages/${id}`));
  }

  // Pipeline preview: from selected template, or default
  const previewPipeline = selectedTemplate
    ? selectedTemplate.pipeline
    : DEFAULT_PIPELINE_STEPS.map((name, i) => ({ id: `d${i}`, name, state: "idle" as const }));

  const pipelineStepNames = selectedTemplate
    ? selectedTemplate.pipeline.map((s) => s.name)
    : DEFAULT_PIPELINE_STEPS;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">New Message</h1>
        <p className="text-gray-500 mt-1 text-sm">
          Describe your idea and configure how it should be generated and published.
        </p>
      </div>

      <div className="space-y-6">
        {/* ── Template section ── */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="font-semibold text-gray-900 mb-1">Start from a Template</h2>
          <p className="text-xs text-gray-500 mb-3">
            Pre-fills channels, assets, and pipeline. You can customize everything below.
          </p>
          <TemplateSelector
            templates={templates}
            selectedId={selectedTemplate?.id ?? null}
            brand={brand}
            onChange={applyTemplate}
            showPreview
          />
        </section>

        {/* ── Idea ── */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="font-semibold text-gray-900 mb-3">Message Idea</h2>
          <textarea
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            placeholder="Describe the idea, angle, or insight you want to share. The more context you give, the better the output."
            className="w-full min-h-[120px] text-sm resize-none border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder-gray-400"
            rows={5}
          />
          <p className="text-xs text-gray-400 mt-1.5">{idea.length} characters</p>
        </section>

        {/* ── Brand & Publish ── */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Brand &amp; Publishing</h2>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Brand</label>
              <div className="flex gap-2">
                {(["LLIF", "BestLife"] as Brand[]).map((b) => (
                  <button key={b} onClick={() => setBrand(b)}
                    className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium border-2 transition-all ${brand === b ? (b === "LLIF" ? "bg-indigo-50 border-indigo-500 text-indigo-700" : "bg-emerald-50 border-emerald-500 text-emerald-700") : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"}`}
                  >{b}</button>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-1.5">
                {brand === "LLIF" ? "Research-informed · Privacy-forward" : "Accessible · Wellness-coach tone"}
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Publish Mode</label>
              <div className="space-y-1.5">
                {([
                  { value: "draft" as const, label: "Save as Draft", desc: "Work in progress" },
                  { value: "now" as const, label: "Publish Now", desc: "After approval" },
                  { value: "schedule" as const, label: "Schedule", desc: "Pick date & time" },
                ]).map(({ value, label, desc }) => (
                  <button key={value} onClick={() => setPublishMode(value)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-sm transition-all ${publishMode === value ? "border-indigo-400 bg-indigo-50 text-indigo-700" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}
                  >
                    <span className="font-medium">{label}</span>
                    <span className="text-xs opacity-60">{desc}</span>
                  </button>
                ))}
              </div>
              {publishMode === "schedule" && (
                <input type="datetime-local" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)}
                  className="mt-2 w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              )}
            </div>
          </div>
        </section>

        {/* ── Channels ── */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="font-semibold text-gray-900 mb-3">Channels</h2>
          <div className="flex flex-wrap gap-2">
            {ALL_CHANNELS.map((ch) => (
              <button key={ch} onClick={() => toggleChannel(ch)}
                className={`py-1.5 px-4 rounded-full text-sm font-medium border transition-all ${channels.includes(ch) ? "bg-indigo-50 text-indigo-700 border-indigo-300" : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"}`}
              >{CHANNEL_LABELS[ch]}</button>
            ))}
          </div>
        </section>

        {/* ── Asset Types ── */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900">Asset Types</h2>
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input type="checkbox" checked={useCustomAssets} onChange={(e) => setUseCustomAssets(e.target.checked)} className="rounded" />
              Custom selection
            </label>
          </div>
          {useCustomAssets ? (
            <div className="grid grid-cols-2 gap-2">
              {ALL_ASSET_TYPES.map((t) => (
                <label key={t} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={selectedAssets.includes(t)} onChange={() => toggleAsset(t)} className="rounded accent-indigo-600" />
                  <span className="text-sm text-gray-700">{ASSET_TYPE_LABELS[t]}</span>
                </label>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">Assets will be inferred automatically from selected channels.</p>
          )}
        </section>

        {/* ── Pipeline preview ── */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900">Agent Pipeline</h2>
            {selectedTemplate && (
              <a href={`/workflows/${selectedTemplate.id}`} className="text-xs text-indigo-500 hover:underline">
                Edit template →
              </a>
            )}
          </div>
          <div className="mb-3">
            <PipelinePreview steps={previewPipeline} size="md" />
          </div>
          <div className="space-y-2">
            {pipelineStepNames.map((name, i) => (
              <div key={name} className="flex items-center gap-3">
                <div className="w-5 h-5 rounded-full bg-gray-100 text-gray-400 text-[10px] flex items-center justify-center font-semibold flex-shrink-0">
                  {i + 1}
                </div>
                <div>
                  <span className="font-medium text-sm text-gray-800">{name}</span>
                  <span className="text-gray-400 text-xs ml-2">{PIPELINE_DESCRIPTIONS[name]}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {error && (
          <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</p>
        )}

        {publishMode !== "draft" && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
            {publishMode === "now"
              ? "Approval will publish this message immediately to all selected channels."
              : `Approval will schedule this message for ${scheduledFor ? new Date(scheduledFor).toLocaleString() : "the specified time"}.`}
          </div>
        )}

        <button
          onClick={handleCreate}
          disabled={pending || !idea.trim()}
          className="w-full py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-semibold rounded-xl hover:from-indigo-700 hover:to-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
        >
          {pending ? "Creating…" : "Create Message →"}
        </button>
      </div>
    </div>
  );
}
