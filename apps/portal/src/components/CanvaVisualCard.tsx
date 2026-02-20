"use client";

import { useEffect, useState } from "react";
import type { CanvaTemplateClient, CanvaTemplateField } from "@/config/canvaTemplates";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CanvaStatus {
  connected: boolean;
  expired?: boolean;
  connectedBy?: { name: string; email: string };
}

interface CanvaAssetRow {
  id: string;
  wpUrl: string;
  wpMediaId: number;
  wpSite: string;
  meta: Record<string, unknown>;
  createdAt: string;
  createdBy: { name: string };
}

interface GenerateResult {
  wpUrl: string;
  wpMediaId: number;
  wpSite: string;
  canvaAssetId: string;
}

interface CanvaVisualCardProps {
  artifactId: string;
  /** Detected brand from artifact target/metadata — used to pre-filter templates */
  brand?: "llif" | "bestlife" | null;
  /** Current user's role */
  userRole: "admin" | "approver" | "publisher";
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CanvaVisualCard({
  artifactId,
  brand,
  userRole,
}: CanvaVisualCardProps) {
  const [status, setStatus] = useState<CanvaStatus | null>(null);
  const [templates, setTemplates] = useState<CanvaTemplateClient[]>([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState(false);
  const [lastResult, setLastResult] = useState<GenerateResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previousAssets, setPreviousAssets] = useState<CanvaAssetRow[]>([]);
  const [showPrevious, setShowPrevious] = useState(false);

  // ── Load Canva status + templates ──────────────────────────────────────────
  useEffect(() => {
    fetch("/api/integrations/canva/status")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ connected: false }));

    const templateUrl = brand
      ? `/api/agents/canva/templates?brand=${brand}`
      : "/api/agents/canva/templates";

    fetch(templateUrl)
      .then((r) => r.json())
      .then((list: CanvaTemplateClient[]) => {
        setTemplates(list);
        if (list.length > 0) setSelectedKey(list[0].key);
      })
      .catch(() => {});
  }, [brand, artifactId]);

  // ── Load previous canva assets for this artifact ───────────────────────────
  useEffect(() => {
    fetch(`/api/agents/canva/assets?artifactId=${artifactId}`)
      .then((r) => r.json())
      .then((rows: CanvaAssetRow[]) => setPreviousAssets(rows))
      .catch(() => {});
  }, [artifactId, lastResult]);

  // ── Sync fields when template changes ─────────────────────────────────────
  const activeTemplate = templates.find((t) => t.key === selectedKey);
  useEffect(() => {
    if (activeTemplate) {
      setFields((prev) => {
        const next: Record<string, string> = {};
        for (const f of activeTemplate.fields) {
          next[f.key] = prev[f.key] ?? "";
        }
        return next;
      });
    }
  }, [selectedKey, activeTemplate]);

  // ── Generate ───────────────────────────────────────────────────────────────
  async function handleGenerate() {
    setError(null);
    setLastResult(null);
    setGenerating(true);

    try {
      const res = await fetch("/api/agents/canva/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artifactId, templateKey: selectedKey, fields }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? `Server error ${res.status}`);
        return;
      }

      setLastResult({
        wpUrl: data.canvaAsset.wpUrl,
        wpMediaId: data.canvaAsset.wpMediaId,
        wpSite: data.canvaAsset.wpSite,
        canvaAssetId: data.canvaAsset.id,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setGenerating(false);
    }
  }

  // ── Render: not yet loaded ─────────────────────────────────────────────────
  if (status === null) {
    return (
      <div className="border rounded p-4 text-sm text-gray-400">
        Loading Canva status…
      </div>
    );
  }

  // ── Render: not connected ──────────────────────────────────────────────────
  if (!status.connected) {
    return (
      <div className="border rounded p-4">
        <h3 className="text-sm font-bold mb-1">Create Visual (Canva)</h3>
        <p className="text-sm text-gray-500 mb-3">
          Canva is not connected.{" "}
          {userRole === "admin" ? (
            <a
              href="/api/integrations/canva/connect"
              className="text-blue-600 hover:underline"
            >
              Connect Canva now
            </a>
          ) : (
            "Contact an admin to connect Canva."
          )}
        </p>
      </div>
    );
  }

  // ── Render: expired token ──────────────────────────────────────────────────
  if (status.expired) {
    return (
      <div className="border rounded p-4">
        <h3 className="text-sm font-bold mb-1">Create Visual (Canva)</h3>
        <p className="text-sm text-yellow-600 mb-3">
          Canva token has expired.{" "}
          {userRole === "admin" ? (
            <a
              href="/api/integrations/canva/connect"
              className="text-blue-600 hover:underline"
            >
              Re-connect Canva
            </a>
          ) : (
            "Contact an admin to re-connect Canva."
          )}
        </p>
      </div>
    );
  }

  // ── Render: main card ──────────────────────────────────────────────────────
  return (
    <div className="border rounded p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold">Create Visual (Canva)</h3>
        {previousAssets.length > 0 && (
          <button
            onClick={() => setShowPrevious(!showPrevious)}
            className="text-xs text-blue-600 hover:underline"
          >
            {showPrevious ? "Hide" : `View ${previousAssets.length} previous`}
          </button>
        )}
      </div>

      {/* Previous assets */}
      {showPrevious && previousAssets.length > 0 && (
        <div className="mb-4 space-y-2">
          {previousAssets.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-3 bg-gray-50 rounded p-2 text-xs"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={a.wpUrl}
                alt={(a.meta?.templateName as string) ?? "Canva visual"}
                className="h-12 w-12 object-cover rounded border flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">
                  {(a.meta?.templateName as string) ?? a.wpSite}
                </div>
                <div className="text-gray-400">
                  {new Date(a.createdAt).toLocaleString()} · {a.createdBy.name}
                </div>
              </div>
              <a
                href={a.wpUrl}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 hover:underline flex-shrink-0"
              >
                Open
              </a>
            </div>
          ))}
        </div>
      )}

      {/* Template selector */}
      {templates.length === 0 ? (
        <p className="text-sm text-gray-400 mb-3">
          No templates available{brand ? ` for brand "${brand}"` : ""}.
        </p>
      ) : (
        <div className="mb-3">
          <label className="block text-xs font-medium mb-1">Template</label>
          <select
            value={selectedKey}
            onChange={(e) => setSelectedKey(e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm"
          >
            {templates.map((t) => (
              <option key={t.key} value={t.key}>
                {t.name} — {t.format}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Fields form */}
      {activeTemplate && (
        <div className="space-y-3 mb-4">
          {activeTemplate.fields.map((f: CanvaTemplateField) => (
            <div key={f.key}>
              <label className="block text-xs font-medium mb-1">
                {f.label}
                {f.required && <span className="text-red-500 ml-0.5">*</span>}
                {f.maxLength && (
                  <span className="text-gray-400 font-normal ml-1">
                    ({(fields[f.key] ?? "").length}/{f.maxLength})
                  </span>
                )}
              </label>
              <input
                type="text"
                value={fields[f.key] ?? ""}
                maxLength={f.maxLength}
                onChange={(e) =>
                  setFields((prev) => ({ ...prev, [f.key]: e.target.value }))
                }
                placeholder={f.label}
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </div>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700 mb-3">
          {error}
        </div>
      )}

      {/* Result preview */}
      {lastResult && (
        <div className="bg-green-50 border border-green-200 rounded p-3 mb-3">
          <div className="text-xs font-medium text-green-800 mb-2">
            Visual generated and uploaded to {lastResult.wpSite} WordPress (ID{" "}
            {lastResult.wpMediaId})
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lastResult.wpUrl}
            alt="Generated visual"
            className="max-h-48 rounded border object-contain mb-2"
          />
          <a
            href={lastResult.wpUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-blue-600 hover:underline"
          >
            Open in WordPress ↗
          </a>
        </div>
      )}

      {/* Generate button */}
      <button
        onClick={handleGenerate}
        disabled={generating || !selectedKey || templates.length === 0}
        className="w-full bg-gray-900 text-white py-2 rounded text-sm font-medium hover:bg-gray-800 disabled:opacity-50"
      >
        {generating ? "Generating…" : "Generate Visual"}
      </button>

      {generating && (
        <p className="text-xs text-gray-400 mt-2 text-center">
          Generating design and uploading to WordPress (up to 60 s)…
        </p>
      )}
    </div>
  );
}
