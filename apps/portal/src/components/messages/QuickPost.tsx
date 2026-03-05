"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Brand, Channel, PublishMode, WorkflowTemplate } from "@/lib/types";
import { ALL_CHANNELS, CHANNEL_LABELS } from "@/lib/types";
import { autoSelectWorkflow } from "@/lib/workflows";
import TemplateSelector from "@/components/workflows/TemplateSelector";
import PipelinePreview from "@/components/workflows/PipelinePreview";

interface QuickPostProps {
  templates: WorkflowTemplate[];
}

export default function QuickPost({ templates }: QuickPostProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [idea, setIdea] = useState("");
  const [brand, setBrand] = useState<Brand>("LLIF");
  const [channels, setChannels] = useState<Channel[]>(["linkedin"]);
  const [publishMode, setPublishMode] = useState<PublishMode>("draft");
  const [scheduledFor, setScheduledFor] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [autoTemplate, setAutoTemplate] = useState<WorkflowTemplate | null>(null);
  const [error, setError] = useState("");

  // Auto-select when channels/brand change and no manual template is selected
  useEffect(() => {
    if (selectedTemplateId) return;
    const auto = autoSelectWorkflow(channels, brand);
    setAutoTemplate(auto);
  }, [channels, brand, selectedTemplateId]);

  function handleTemplateChange(tmpl: WorkflowTemplate | null) {
    setSelectedTemplateId(tmpl?.id ?? null);
    setAutoTemplate(null);
    if (tmpl) {
      if (tmpl.defaultChannels?.length) setChannels(tmpl.defaultChannels);
      if (tmpl.defaultPublishMode) setPublishMode(tmpl.defaultPublishMode);
    }
  }

  function toggleChannel(ch: Channel) {
    setChannels((prev) =>
      prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]
    );
  }

  async function handleGenerate() {
    if (!idea.trim()) { setError("Please describe your message idea."); return; }
    if (channels.length === 0) { setError("Select at least one channel."); return; }
    setError("");

    const templateId = selectedTemplateId ?? autoTemplate?.id ?? undefined;

    const res = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idea, brand, channels, publishMode, scheduledFor: scheduledFor || undefined, templateId }),
    });

    if (!res.ok) { setError("Failed to create message."); return; }
    const { id } = await res.json() as { id: string };
    startTransition(() => router.push(`/messages/${id}`));
  }

  const effectiveTemplate =
    selectedTemplateId
      ? templates.find((t) => t.id === selectedTemplateId) ?? null
      : autoTemplate;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 space-y-4">
      {/* Idea textarea */}
      <textarea
        value={idea}
        onChange={(e) => setIdea(e.target.value)}
        placeholder="What's the message? Describe the idea, angle, or insight you want to share…"
        className="w-full min-h-[88px] text-sm resize-none border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder-gray-400"
        rows={3}
      />

      {/* Brand + Publish mode row */}
      <div className="flex flex-wrap gap-4">
        <div className="flex-1 min-w-[130px]">
          <label className="block text-[10px] font-semibold text-gray-400 mb-1 uppercase tracking-wide">Brand</label>
          <div className="flex gap-1.5">
            {(["LLIF", "BestLife"] as Brand[]).map((b) => (
              <button key={b} onClick={() => setBrand(b)}
                className={`flex-1 py-1.5 px-2 rounded-full text-xs font-medium border transition-all ${brand === b ? (b === "LLIF" ? "bg-indigo-600 text-white border-indigo-600" : "bg-emerald-600 text-white border-emerald-600") : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"}`}
              >{b}</button>
            ))}
          </div>
        </div>

        <div className="flex-1 min-w-[170px]">
          <label className="block text-[10px] font-semibold text-gray-400 mb-1 uppercase tracking-wide">Publish</label>
          <div className="flex gap-1">
            {(["draft", "now", "schedule"] as PublishMode[]).map((m) => (
              <button key={m} onClick={() => setPublishMode(m)}
                className={`flex-1 py-1.5 px-1.5 rounded-full text-[10px] font-medium border transition-all ${publishMode === m ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"}`}
              >{m === "now" ? "Now" : m === "schedule" ? "Schedule" : "Draft"}</button>
            ))}
          </div>
        </div>
      </div>

      {publishMode === "schedule" && (
        <input type="datetime-local" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
      )}

      {/* Channels */}
      <div>
        <label className="block text-[10px] font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">Channels</label>
        <div className="flex flex-wrap gap-1.5">
          {ALL_CHANNELS.map((ch) => (
            <button key={ch} onClick={() => toggleChannel(ch)}
              className={`py-1 px-2.5 rounded-full text-[11px] font-medium border transition-all ${channels.includes(ch) ? "bg-indigo-50 text-indigo-700 border-indigo-300" : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"}`}
            >{CHANNEL_LABELS[ch]}</button>
          ))}
        </div>
      </div>

      {/* Workflow template */}
      <div>
        <label className="block text-[10px] font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">
          Workflow Template
          {!selectedTemplateId && autoTemplate && (
            <span className="ml-1 normal-case font-normal text-indigo-500">(auto-selected)</span>
          )}
        </label>
        <TemplateSelector
          templates={templates}
          selectedId={selectedTemplateId}
          brand={brand}
          onChange={handleTemplateChange}
          showPreview={false}
        />

        {/* Compact pipeline preview */}
        {effectiveTemplate && (
          <div className="mt-2 bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 flex items-center justify-between gap-2">
            <PipelinePreview steps={effectiveTemplate.pipeline} size="sm" />
            <a href={`/workflows/${effectiveTemplate.id}`}
              className="text-[10px] text-indigo-500 hover:underline whitespace-nowrap flex-shrink-0">
              View →
            </a>
          </div>
        )}
      </div>

      {error && <p className="text-red-600 text-xs">{error}</p>}

      <button
        onClick={handleGenerate}
        disabled={pending || !idea.trim()}
        className="w-full py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-semibold rounded-xl hover:from-indigo-700 hover:to-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm shadow-sm"
      >
        {pending ? "Creating…" : "Generate →"}
      </button>
    </div>
  );
}
