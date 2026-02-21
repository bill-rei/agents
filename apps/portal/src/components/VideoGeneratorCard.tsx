"use client";

import { useState, useEffect, useRef } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

type AspectRatio = "9:16" | "16:9" | "1:1";
type Duration = 5 | 10 | 15;

interface VariantConfig {
  variant_id: string;
  aspect_ratio: AspectRatio;
  duration_seconds: Duration;
  label: string;
}

interface VideoAssetRow {
  id: string;
  variantId: string;
  aspectRatio: AspectRatio;
  durationSeconds: number;
  wpUrl: string | null;
  storagePath: string;
  brand: string;
  createdAt: string;
}

interface JobStatusResponse {
  jobId: string;
  status: "pending" | "running" | "completed" | "failed";
  error: string | null;
  videoAssets: VideoAssetRow[];
}

interface VideoGeneratorCardProps {
  artifactId: string;
  brand: "llif" | "bestlife" | null;
}

// ─── Preset variants ──────────────────────────────────────────────────────────

const VARIANT_PRESETS: VariantConfig[] = [
  { variant_id: "vertical_10s", aspect_ratio: "9:16", duration_seconds: 10, label: "Vertical 9:16 · 10s (Stories / Reels)" },
  { variant_id: "landscape_10s", aspect_ratio: "16:9", duration_seconds: 10, label: "Landscape 16:9 · 10s (LinkedIn / YouTube)" },
  { variant_id: "square_10s", aspect_ratio: "1:1", duration_seconds: 10, label: "Square 1:1 · 10s (Instagram feed)" },
  { variant_id: "vertical_5s", aspect_ratio: "9:16", duration_seconds: 5, label: "Vertical 9:16 · 5s (X / quick post)" },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function VideoGeneratorCard({ artifactId, brand }: VideoGeneratorCardProps) {
  const [brief, setBrief] = useState("");
  const [selectedVariants, setSelectedVariants] = useState<Set<string>>(new Set(["vertical_10s", "landscape_10s"]));
  const [notes, setNotes] = useState("");

  const [generating, setGenerating] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Polling ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!jobId) return;

    const poll = async () => {
      try {
        const res = await fetch(`/api/video/${jobId}`);
        if (!res.ok) return;
        const data: JobStatusResponse = await res.json();
        setJobStatus(data);

        if (data.status === "running" || data.status === "pending") {
          pollRef.current = setTimeout(poll, 5000);
        } else {
          setGenerating(false);
          if (data.status === "failed") {
            setError(data.error ?? "Video generation failed");
          }
        }
      } catch {
        setGenerating(false);
      }
    };

    pollRef.current = setTimeout(poll, 3000);
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [jobId]);

  // ── Generate ───────────────────────────────────────────────────────────────
  async function handleGenerate() {
    if (!brand) {
      setError("Cannot detect brand from artifact. Check that target.brand or target.site_key is set.");
      return;
    }
    if (!brief.trim()) {
      setError("Please enter a creative brief.");
      return;
    }
    if (selectedVariants.size === 0) {
      setError("Select at least one video variant.");
      return;
    }

    setError(null);
    setJobStatus(null);
    setJobId(null);
    setGenerating(true);

    const variants = VARIANT_PRESETS.filter((v) => selectedVariants.has(v.variant_id)).map((v) => ({
      variant_id: v.variant_id,
      aspect_ratio: v.aspect_ratio,
      duration_seconds: v.duration_seconds,
    }));

    try {
      const res = await fetch("/api/video/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artifactId, brand, brief, variants, notes }),
      });

      const data = await res.json() as { ok?: boolean; jobId?: string; error?: string; refused?: boolean; gate?: string };

      if (!res.ok) {
        setGenerating(false);
        if (data.refused) {
          setError(`Safety gate blocked this request (${data.gate ?? "unknown gate"}): ${data.error}`);
        } else {
          setError(data.error ?? `Server error ${res.status}`);
        }
        return;
      }

      setJobId(data.jobId!);
    } catch (err) {
      setGenerating(false);
      setError(err instanceof Error ? err.message : "Unexpected error");
    }
  }

  function toggleVariant(variantId: string) {
    setSelectedVariants((prev) => {
      const next = new Set(prev);
      if (next.has(variantId)) next.delete(variantId);
      else next.add(variantId);
      return next;
    });
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="border rounded p-4">
      <h3 className="text-sm font-bold mb-4">Generate Marketing Video (xAI Imagine)</h3>

      {!brand && (
        <p className="text-xs text-yellow-600 mb-3 bg-yellow-50 border border-yellow-200 rounded p-2">
          Brand not detected from artifact target. Set{" "}
          <code className="font-mono">target.brand</code> to{" "}
          <code className="font-mono">&quot;llif&quot;</code> or{" "}
          <code className="font-mono">&quot;bestlife&quot;</code> to enable video generation.
        </p>
      )}

      {/* Brief */}
      <div className="mb-3">
        <label className="block text-xs font-medium mb-1">
          Creative Brief <span className="text-red-500">*</span>
        </label>
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          rows={3}
          disabled={generating}
          placeholder="Describe the video concept, key message, visual style, and call-to-action..."
          className="w-full border rounded px-3 py-2 text-sm disabled:opacity-50"
        />
      </div>

      {/* Variant selector */}
      <div className="mb-3">
        <label className="block text-xs font-medium mb-1">Variants</label>
        <div className="space-y-1">
          {VARIANT_PRESETS.map((v) => (
            <label key={v.variant_id} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={selectedVariants.has(v.variant_id)}
                onChange={() => toggleVariant(v.variant_id)}
                disabled={generating}
                className="rounded"
              />
              {v.label}
            </label>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div className="mb-4">
        <label className="block text-xs font-medium mb-1">Notes (optional)</label>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={generating}
          placeholder="Additional operator notes for the safety reviewer..."
          className="w-full border rounded px-3 py-2 text-sm disabled:opacity-50"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700 mb-3">
          {error}
        </div>
      )}

      {/* Status / progress */}
      {generating && (
        <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-700 mb-3">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            {jobId ? `Generating videos… (job ${jobId.slice(0, 8)})` : "Starting…"}
          </div>
          <p className="text-xs text-blue-500 mt-1">
            xAI video generation can take 2–5 minutes per variant. Polling every 5 s.
          </p>
        </div>
      )}

      {/* Results */}
      {jobStatus && jobStatus.videoAssets.length > 0 && (
        <div className="mb-4">
          <div className="text-xs font-medium text-green-700 mb-2">
            {jobStatus.videoAssets.length} video{jobStatus.videoAssets.length !== 1 ? "s" : ""} generated
            {jobStatus.status === "running" && " (more in progress…)"}
          </div>
          <div className="space-y-2">
            {jobStatus.videoAssets.map((va) => (
              <div key={va.id} className="flex items-center justify-between bg-gray-50 border rounded p-3 text-xs">
                <div>
                  <div className="font-medium">{va.variantId.replace(/_/g, " ")}</div>
                  <div className="text-gray-500">
                    {va.aspectRatio} · {va.durationSeconds}s · {va.brand}
                  </div>
                  {va.wpUrl && (
                    <div className="text-gray-400 truncate max-w-xs">{va.wpUrl}</div>
                  )}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  {va.wpUrl && (
                    <a
                      href={va.wpUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      Open ↗
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Generate button */}
      <button
        onClick={handleGenerate}
        disabled={generating || !brand}
        className="w-full bg-gray-900 text-white py-2 rounded text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
      >
        {generating ? "Generating…" : "Generate Videos"}
      </button>
    </div>
  );
}
