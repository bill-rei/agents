"use client";

import { useState, useEffect, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface StepSummary {
  id: string;
  step: string;
  status: string; // ok | invalid | error | pending
  hash: string | null;
  validationErrors: string[];
  validationWarnings: string[];
  createdAt: string;
  inputStepId: string | null;
}

interface StepDetail extends StepSummary {
  markdownOutput: string | null;
  jsonPayload: unknown;
  renderedHtml: string | null;
}

type InspectorTab = "markdown" | "rendered" | "json" | "validation";

// ── Agent display labels ──────────────────────────────────────────────────────

const AGENT_LABELS: Record<string, string> = {
  strategist: "Strategist",
  "marketing-compiler": "Compiler",
  editor: "Editor",
  distributor: "Distributor",
  optimizer: "Optimizer",
  "site-auditor": "Site Auditor",
  "website-messaging-architect": "Messaging Architect",
  "web-renderer": "Web Renderer",
  "marketing-video-producer": "Video Producer",
};

function agentLabel(key: string): string {
  return AGENT_LABELS[key] ?? key;
}

// ── Status helpers ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    ok: "bg-green-100 text-green-800",
    invalid: "bg-yellow-100 text-yellow-800",
    error: "bg-red-100 text-red-800",
    pending: "bg-gray-100 text-gray-600",
  };
  const cls = styles[status] ?? "bg-gray-100 text-gray-600";
  return (
    <span
      className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${cls}`}
    >
      {status}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function RunStepsView({
  runId,
  workflowKey: _workflowKey,
  initialSteps,
}: {
  runId: string;
  workflowKey: string;
  initialSteps: StepSummary[];
}) {
  const [steps, setSteps] = useState<StepSummary[]>(initialSteps);
  const [selectedStep, setSelectedStep] = useState<string | null>(
    initialSteps[0]?.step ?? null
  );
  const [detail, setDetail] = useState<StepDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [tab, setTab] = useState<InspectorTab>("markdown");
  const [copySuccess, setCopySuccess] = useState(false);

  // Poll for new steps while any are in-flight
  useEffect(() => {
    const interval = setInterval(async () => {
      const res = await fetch(`/api/runs/${runId}/steps`);
      if (res.ok) {
        const data: StepSummary[] = await res.json();
        setSteps(data);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [runId]);

  // Fetch step detail whenever selection changes
  const loadDetail = useCallback(
    async (stepKey: string) => {
      setDetailLoading(true);
      setDetail(null);
      try {
        const res = await fetch(`/api/runs/${runId}/steps/${stepKey}`);
        if (res.ok) {
          const data: StepDetail = await res.json();
          setDetail(data);
        }
      } finally {
        setDetailLoading(false);
      }
    },
    [runId]
  );

  useEffect(() => {
    if (selectedStep) {
      setTab("markdown");
      loadDetail(selectedStep);
    }
  }, [selectedStep, loadDetail]);

  function handleSelectStep(stepKey: string) {
    setSelectedStep(stepKey);
  }

  async function handleCopyMarkdown() {
    if (!detail?.markdownOutput) return;
    try {
      await navigator.clipboard.writeText(detail.markdownOutput);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch {
      /* ignore */
    }
  }

  function handleDownloadJson() {
    if (!detail) return;
    const blob = new Blob([JSON.stringify(detail.jsonPayload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${detail.step}-${runId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (steps.length === 0) {
    return (
      <div className="p-6 text-sm text-gray-500">
        No agent steps recorded for this run yet. Execute an agent to see its output here.
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-10rem)] min-h-[500px] overflow-hidden rounded-lg border border-gray-200">
      {/* ── Left: Timeline ──────────────────────────────────────────────────── */}
      <aside className="w-56 flex-shrink-0 overflow-y-auto border-r border-gray-200 bg-gray-50 p-3">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-400">
          Pipeline Steps
        </p>
        <ol className="relative space-y-1 border-l border-gray-200 pl-4">
          {steps.map((s, idx) => {
            const active = s.step === selectedStep;
            const hasErrors = s.validationErrors.length > 0;
            const hasWarnings = s.validationWarnings.length > 0;
            return (
              <li key={s.id} className="relative">
                {/* Timeline dot */}
                <span
                  className={`absolute -left-[1.35rem] top-2 h-3 w-3 rounded-full border-2 ${
                    active
                      ? "border-blue-600 bg-blue-600"
                      : s.status === "ok"
                      ? "border-green-500 bg-green-500"
                      : s.status === "invalid" || s.status === "error"
                      ? "border-red-400 bg-red-400"
                      : "border-gray-300 bg-white"
                  }`}
                />
                <button
                  onClick={() => handleSelectStep(s.step)}
                  className={`w-full rounded px-2 py-1.5 text-left text-sm transition-colors ${
                    active
                      ? "bg-blue-50 font-medium text-blue-700"
                      : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  <span className="block truncate">{agentLabel(s.step)}</span>
                  <span className="mt-0.5 flex items-center gap-1">
                    <StatusBadge status={s.status} />
                    {hasErrors && (
                      <span className="text-xs text-red-600">
                        {s.validationErrors.length}✕
                      </span>
                    )}
                    {hasWarnings && !hasErrors && (
                      <span className="text-xs text-yellow-600">
                        {s.validationWarnings.length}⚠
                      </span>
                    )}
                  </span>
                  {s.hash && (
                    <span className="mt-0.5 block font-mono text-xs text-gray-400">
                      #{s.hash.slice(0, 8)}
                    </span>
                  )}
                  <span className="block text-xs text-gray-400">
                    {new Date(s.createdAt).toLocaleTimeString()}
                  </span>
                </button>
                {/* Connector line between steps */}
                {idx < steps.length - 1 && (
                  <div className="ml-1 h-2 w-px bg-gray-200" />
                )}
              </li>
            );
          })}
        </ol>
      </aside>

      {/* ── Right: Step Inspector ───────────────────────────────────────────── */}
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {!selectedStep ? (
          <div className="flex flex-1 items-center justify-center text-sm text-gray-400">
            Select a step to inspect its output.
          </div>
        ) : detailLoading ? (
          <div className="flex flex-1 items-center justify-center text-sm text-gray-400">
            Loading…
          </div>
        ) : !detail ? (
          <div className="flex flex-1 items-center justify-center text-sm text-gray-400">
            Step not found.
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <div className="flex items-center gap-2">
                <h2 className="font-semibold text-gray-800">
                  {agentLabel(detail.step)}
                </h2>
                <StatusBadge status={detail.status} />
                {detail.hash && (
                  <span className="font-mono text-xs text-gray-400">
                    #{detail.hash}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleCopyMarkdown}
                  disabled={!detail.markdownOutput}
                  className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                >
                  {copySuccess ? "Copied!" : "Copy Markdown"}
                </button>
                <button
                  onClick={handleDownloadJson}
                  className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                >
                  Download JSON
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-200 px-4">
              {(
                [
                  { key: "markdown", label: "Markdown" },
                  { key: "rendered", label: "Rendered" },
                  { key: "json", label: "Raw JSON" },
                  { key: "validation", label: "Validation" },
                ] as { key: InspectorTab; label: string }[]
              ).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setTab(key)}
                  className={`px-4 py-2 text-sm border-b-2 -mb-px ${
                    tab === key
                      ? "border-blue-600 font-medium text-blue-700"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {label}
                  {key === "validation" &&
                    detail.validationErrors.length > 0 && (
                      <span className="ml-1 rounded-full bg-red-500 px-1 py-0.5 text-xs text-white">
                        {detail.validationErrors.length}
                      </span>
                    )}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-auto">
              {tab === "markdown" && (
                <pre className="h-full overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-sm leading-relaxed text-gray-800">
                  {detail.markdownOutput ?? "(no output)"}
                </pre>
              )}

              {tab === "rendered" && (
                <div className="p-6">
                  {detail.renderedHtml ? (
                    <div
                      className="prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: detail.renderedHtml }}
                    />
                  ) : (
                    <p className="text-sm text-gray-400">(no rendered output)</p>
                  )}
                </div>
              )}

              {tab === "json" && (
                <pre className="h-full overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-xs leading-relaxed text-gray-700">
                  {JSON.stringify(detail.jsonPayload, null, 2)}
                </pre>
              )}

              {tab === "validation" && (
                <div className="p-4 space-y-4">
                  {detail.validationErrors.length === 0 &&
                    detail.validationWarnings.length === 0 && (
                      <p className="text-sm text-green-700">
                        All validation checks passed.
                      </p>
                    )}

                  {detail.validationErrors.length > 0 && (
                    <div>
                      <h3 className="mb-2 font-semibold text-red-700">
                        Errors ({detail.validationErrors.length})
                      </h3>
                      <ul className="space-y-1">
                        {detail.validationErrors.map((e, i) => (
                          <li
                            key={i}
                            className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
                          >
                            {e}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {detail.validationWarnings.length > 0 && (
                    <div>
                      <h3 className="mb-2 font-semibold text-yellow-700">
                        Warnings ({detail.validationWarnings.length})
                      </h3>
                      <ul className="space-y-1">
                        {detail.validationWarnings.map((w, i) => (
                          <li
                            key={i}
                            className="rounded border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800"
                          >
                            {w}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="border-t border-gray-100 pt-4">
                    <h3 className="mb-2 text-sm font-semibold text-gray-600">
                      Frontmatter
                    </h3>
                    <pre className="rounded bg-gray-50 p-3 font-mono text-xs text-gray-700">
                      {detail.markdownOutput
                        ? extractFrontmatter(detail.markdownOutput)
                        : "(none)"}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

// ── Utility ───────────────────────────────────────────────────────────────────

function extractFrontmatter(md: string): string {
  const norm = md.replace(/\r\n/g, "\n");
  if (!norm.startsWith("---\n")) return "(no frontmatter)";
  const end = norm.indexOf("\n---\n", 4);
  if (end === -1) return "(unclosed frontmatter)";
  return norm.slice(0, end + 5);
}
