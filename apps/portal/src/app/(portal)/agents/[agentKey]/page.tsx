"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import AgentStatusDot from "@/components/AgentStatusDot";
import StatusBadge from "@/components/StatusBadge";

interface FieldDef {
  name: string;
  label: string;
  type: string;
  required: boolean;
  fromAgent?: string;
  options?: string[];
}

interface AgentInfo {
  key: string;
  label: string;
  description: string;
  inputFields: FieldDef[];
  online: boolean;
}

interface Execution {
  id: string;
  agentKey: string;
  status: string;
  output: string;
  error: string | null;
  durationMs: number | null;
  createdAt: string;
  createdBy: { name: string };
  parentExec: { id: string; agentKey: string } | null;
  inputs?: Record<string, string>;
}

interface RunOption {
  id: string;
  workflowKey: string;
  project: { id: string; name: string };
  createdAt: string;
}

interface ProjectDoc {
  id: string;
  filename: string;
  size: number;
}

interface ProviderConfig {
  id: string;
  displayName: string;
  apiKeyEnvVar: string;
  defaultModel: string;
  available: boolean;
}

interface RetryState {
  failedExecId: string;
  agentLabel: string;
  error: string;
  providerUsed: string;
  attempt: number;
}

export default function AgentPage() {
  const { agentKey } = useParams<{ agentKey: string }>();
  const searchParams = useSearchParams();
  const fromExecId = searchParams.get("fromExec");
  const fromField = searchParams.get("field");

  const [agent, setAgent] = useState<AgentInfo | null>(null);
  const [runs, setRuns] = useState<RunOption[]>([]);
  const [selectedRunId, setSelectedRunId] = useState("");
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [parentExecId, setParentExecId] = useState<string | null>(fromExecId);
  const [executing, setExecuting] = useState(false);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [expandedExec, setExpandedExec] = useState<string | null>(null);
  const [projectDocs, setProjectDocs] = useState<ProjectDoc[]>([]);

  // Provider state
  const [selectedProvider, setSelectedProvider] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("lastProvider") || "";
    }
    return "";
  });
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [retryState, setRetryState] = useState<RetryState | null>(null);
  const [retryProvider, setRetryProvider] = useState<string>("");

  // Load agent config
  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((data) => {
        const found = (data.agents || []).find((a: AgentInfo) => a.key === agentKey);
        setAgent(found || null);
      });
  }, [agentKey]);

  // Load available providers
  useEffect(() => {
    fetch("/api/providers")
      .then((r) => r.json())
      .then((d) => setProviders(d.providers || []));
  }, []);

  // Load runs for the selector
  useEffect(() => {
    fetch("/api/runs")
      .then((r) => r.json())
      .then((data) => {
        setRuns(data || []);
        if (data.length > 0 && !selectedRunId) {
          setSelectedRunId(data[0].id);
        }
      });
  }, [selectedRunId]);

  // Load project docs when run is selected
  useEffect(() => {
    if (!selectedRunId || runs.length === 0) return;
    const run = runs.find((r) => r.id === selectedRunId);
    if (run?.project?.id) {
      fetch(`/api/projects/${run.project.id}/docs`)
        .then((r) => r.json())
        .then((data) => setProjectDocs(Array.isArray(data) ? data : []))
        .catch(() => setProjectDocs([]));
    }
  }, [selectedRunId, runs]);

  // Load executions
  const loadExecutions = useCallback(async () => {
    if (!agentKey) return;
    const url = selectedRunId
      ? `/api/agents/${agentKey}/executions?runId=${selectedRunId}`
      : `/api/agents/${agentKey}/executions`;
    const data = await fetch(url).then((r) => r.json());
    setExecutions(data.items || []);
  }, [agentKey, selectedRunId]);

  useEffect(() => {
    loadExecutions();
  }, [loadExecutions]);

  // Pre-populate from upstream execution
  useEffect(() => {
    if (fromExecId && fromField) {
      fetch(`/api/agents/executions/${fromExecId}`)
        .then((r) => r.json())
        .then((exec) => {
          if (exec.output) {
            setInputs((prev) => ({ ...prev, [fromField]: exec.output }));
            setParentExecId(exec.id);
          }
        });
    }
  }, [fromExecId, fromField]);

  function updateInput(name: string, value: string) {
    setInputs((prev) => ({ ...prev, [name]: value }));
  }

  async function runAgent(providerOverride?: string, attempt = 1) {
    if (!selectedRunId || !agent) return;
    setExecuting(true);
    setRetryState(null);
    try {
      const effectiveProvider =
        providerOverride !== undefined ? providerOverride : selectedProvider;

      const res = await fetch(`/api/agents/${agentKey}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId: selectedRunId,
          inputs,
          parentExecId,
          ...(effectiveProvider ? { providerId: effectiveProvider } : {}),
          ...(attempt > 1 ? { attemptNumber: attempt } : {}),
        }),
      });

      const exec = await res.json();

      if (!res.ok || exec.errorCode) {
        // API-level error (unknown provider, not configured, etc.)
        setRetryState({
          failedExecId: exec.id || "",
          agentLabel: agent.label,
          error: exec.error || "Agent failed to start",
          providerUsed: effectiveProvider || "auto",
          attempt,
        });
        setRetryProvider(effectiveProvider);
      } else if (exec.status === "failed" || exec.error) {
        // Execution-level failure
        setRetryState({
          failedExecId: exec.id || "",
          agentLabel: agent.label,
          error: exec.error || "Agent execution failed",
          providerUsed: effectiveProvider || "auto",
          attempt,
        });
        setRetryProvider(effectiveProvider);
        if (exec.id) setExpandedExec(exec.id);
      } else {
        if (exec.id) setExpandedExec(exec.id);
      }

      loadExecutions();
    } finally {
      setExecuting(false);
    }
  }

  async function loadFromExecution(execId: string, fieldName: string) {
    const exec = await fetch(`/api/agents/executions/${execId}`).then((r) => r.json());
    if (exec.output) {
      setInputs((prev) => ({ ...prev, [fieldName]: exec.output }));
      setParentExecId(exec.id);
    }
  }

  if (!agent) {
    return <p className="text-sm text-gray-500">Loading...</p>;
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/agents" className="text-sm text-gray-400 hover:text-gray-600">&larr; Agents</Link>
        <AgentStatusDot online={agent.online} />
        <h2 className="text-xl font-bold">{agent.label}</h2>
      </div>
      <p className="text-sm text-gray-500 mb-6">{agent.description}</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Input Form */}
        <div className="bg-white border rounded p-4">
          <h3 className="text-sm font-bold text-gray-600 mb-3">Input</h3>

          {/* Run selector */}
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-500 mb-1">Run:</label>
            <select
              value={selectedRunId}
              onChange={(e) => setSelectedRunId(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            >
              {runs.map((run) => (
                <option key={run.id} value={run.id}>
                  {run.project?.name || "?"} / {run.workflowKey} ({new Date(run.createdAt).toLocaleDateString()})
                </option>
              ))}
            </select>
          </div>

          {/* Dynamic fields */}
          {agent.inputFields.map((field) => (
            <div key={field.name} className="mb-3">
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium text-gray-500">
                  {field.label}{field.required && " *"}
                </label>
                {field.fromAgent && executions.length > 0 && (
                  <LoadFromDropdown
                    agentKey={field.fromAgent}
                    onSelect={(execId) => loadFromExecution(execId, field.name)}
                  />
                )}
              </div>
              {field.type === "select" ? (
                <select
                  value={inputs[field.name] || ""}
                  onChange={(e) => updateInput(field.name, e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm"
                >
                  <option value="">-- select --</option>
                  {field.options?.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              ) : field.type === "textarea" ? (
                <textarea
                  value={inputs[field.name] || ""}
                  onChange={(e) => updateInput(field.name, e.target.value)}
                  rows={4}
                  className="w-full border rounded px-3 py-2 text-sm font-mono"
                  placeholder={field.label}
                />
              ) : (
                <input
                  type="text"
                  value={inputs[field.name] || ""}
                  onChange={(e) => updateInput(field.name, e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm"
                  placeholder={field.label}
                />
              )}
            </div>
          ))}

          {parentExecId && (
            <div className="text-xs text-blue-500 mb-3">
              Linked from execution: {parentExecId.slice(0, 8)}...
            </div>
          )}

          {/* Project reference docs indicator */}
          {projectDocs.length > 0 && (
            <div className="mb-3 bg-blue-50 border border-blue-200 rounded p-3">
              <div className="text-xs font-medium text-blue-700 mb-1">
                Reference Docs ({projectDocs.length} file{projectDocs.length !== 1 ? "s" : ""}) — auto-attached
              </div>
              <div className="space-y-1">
                {projectDocs.map((doc) => (
                  <div key={doc.id} className="text-xs text-blue-600">
                    {doc.filename} ({(doc.size / 1024).toFixed(0)} KB)
                  </div>
                ))}
              </div>
              <div className="text-[10px] text-blue-400 mt-1">
                Manage docs in{" "}
                <Link
                  href={`/projects/${runs.find((r) => r.id === selectedRunId)?.project?.id}`}
                  className="underline"
                >
                  Project Settings
                </Link>
              </div>
            </div>
          )}

          {/* LLM Backend selector */}
          <div className="mb-3">
            <label className="block text-xs font-medium text-gray-500 mb-1">LLM Backend</label>
            <select
              value={selectedProvider}
              onChange={(e) => {
                setSelectedProvider(e.target.value);
                localStorage.setItem("lastProvider", e.target.value);
              }}
              className="w-full border rounded px-3 py-2 text-sm"
            >
              <option value="">Auto (server default)</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id} disabled={!p.available}>
                  {p.displayName}{!p.available ? " — not configured" : ""}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => runAgent()}
            disabled={executing || !selectedRunId || !agent.online}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
          >
            {executing ? "Running..." : !agent.online ? "Agent Offline" : "Run Agent"}
          </button>
        </div>

        {/* Right: Execution History */}
        <div>
          <h3 className="text-sm font-bold text-gray-600 mb-3">
            Executions {selectedRunId && <span className="font-normal text-gray-400">(filtered by run)</span>}
          </h3>
          {executions.length === 0 ? (
            <p className="text-sm text-gray-400">No executions yet.</p>
          ) : (
            <div className="space-y-2">
              {executions.map((exec) => (
                <ExecutionRow
                  key={exec.id}
                  exec={exec}
                  expanded={expandedExec === exec.id}
                  onToggle={() => setExpandedExec(expandedExec === exec.id ? null : exec.id)}
                  agentKey={agentKey}
                  providers={providers}
                  onRetry={(providerId) => runAgent(providerId, (exec.inputs?._attemptNumber ? Number(exec.inputs._attemptNumber) : 1) + 1)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Retry Modal */}
      {retryState && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-base font-bold text-gray-800 mb-1">
              Agent failed: {retryState.agentLabel}
            </h3>
            <p className="text-xs text-gray-500 mb-3">
              Attempt {retryState.attempt} &middot; Provider: {retryState.providerUsed || "auto"}
            </p>
            <div className="bg-red-50 border border-red-200 rounded p-3 mb-4">
              <p className="text-sm text-red-700 font-mono break-all">{retryState.error}</p>
            </div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Retry with provider</label>
            <select
              value={retryProvider}
              onChange={(e) => setRetryProvider(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm mb-4"
            >
              <option value="">Auto (server default)</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id} disabled={!p.available}>
                  {p.displayName}{!p.available ? " — not configured" : ""}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const attempt = retryState.attempt + 1;
                  setRetryState(null);
                  runAgent(retryProvider || undefined, attempt);
                }}
                className="flex-1 bg-blue-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-blue-700"
              >
                Retry Step
              </button>
              <button
                onClick={() => setRetryState(null)}
                className="flex-1 bg-gray-100 text-gray-700 px-4 py-2 rounded text-sm border hover:bg-gray-200"
              >
                Stop Job
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──

function LoadFromDropdown({
  agentKey,
  onSelect,
}: {
  agentKey: string;
  onSelect: (execId: string) => void;
}) {
  const [execs, setExecs] = useState<Execution[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open && execs.length === 0) {
      fetch(`/api/agents/${agentKey}/executions?limit=5`)
        .then((r) => r.json())
        .then((data) => setExecs(data.items || []));
    }
  }, [open, agentKey, execs.length]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-blue-500 hover:text-blue-700"
      >
        Load from {agentKey}...
      </button>
    );
  }

  return (
    <div className="relative">
      <div className="absolute right-0 top-0 z-10 bg-white border rounded shadow-lg p-2 w-72">
        <div className="text-xs font-medium text-gray-500 mb-1">Recent {agentKey} outputs:</div>
        {execs.length === 0 ? (
          <p className="text-xs text-gray-400 p-2">No executions found</p>
        ) : (
          execs.filter((e) => e.status === "completed").map((e) => (
            <button
              key={e.id}
              onClick={() => { onSelect(e.id); setOpen(false); }}
              className="block w-full text-left text-xs p-2 hover:bg-blue-50 rounded"
            >
              <span className="text-gray-600">{new Date(e.createdAt).toLocaleString()}</span>
              <span className="text-gray-400 ml-1">({e.durationMs ? `${(e.durationMs / 1000).toFixed(1)}s` : "?"})</span>
              <div className="text-gray-500 truncate mt-0.5">{e.output.slice(0, 80)}...</div>
            </button>
          ))
        )}
        <button onClick={() => setOpen(false)} className="text-xs text-gray-400 mt-1">Close</button>
      </div>
    </div>
  );
}

function ExecutionRow({
  exec,
  expanded,
  onToggle,
  agentKey,
  providers,
  onRetry,
}: {
  exec: Execution;
  expanded: boolean;
  onToggle: () => void;
  agentKey: string;
  providers: ProviderConfig[];
  onRetry: (providerId: string) => void;
}) {
  const [promoting, setPromoting] = useState(false);

  const providerUsed = exec.inputs?._providerId;
  const attemptNumber = exec.inputs?._attemptNumber ? Number(exec.inputs._attemptNumber) : undefined;

  async function promoteToArtifact() {
    setPromoting(true);
    await fetch(`/api/agents/executions/${exec.id}/to-artifact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "social_post", title: `${agentKey} output` }),
    });
    setPromoting(false);
  }

  // Find the next agent in pipeline for "Use as input" button
  const nextAgentMap: Record<string, { key: string; field: string }> = {
    strategist: { key: "marketing-compiler", field: "campaignTheme" },
    "marketing-compiler": { key: "editor", field: "campaignAssets" },
    editor: { key: "distributor", field: "editedAssets" },
    "site-auditor": { key: "website-messaging-architect", field: "siteAuditInput" },
    "website-messaging-architect": { key: "web-renderer", field: "rawCopy" },
  };
  const nextAgent = nextAgentMap[agentKey];

  return (
    <div className={`border rounded text-sm ${exec.status === "completed" ? "bg-white" : exec.status === "failed" ? "bg-red-50 border-red-200" : "bg-yellow-50 border-yellow-200"}`}>
      <button onClick={onToggle} className="w-full text-left p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={exec.status} />
            <span className="text-gray-600">{new Date(exec.createdAt).toLocaleString()}</span>
            {exec.durationMs && (
              <span className="text-xs text-gray-400">{(exec.durationMs / 1000).toFixed(1)}s</span>
            )}
            {providerUsed && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-200 font-mono">
                {providerUsed}
              </span>
            )}
            {attemptNumber && attemptNumber > 1 && (
              <span className="text-xs text-gray-400">attempt {attemptNumber}</span>
            )}
          </div>
          <span className="text-xs text-gray-400">{expanded ? "▲" : "▼"}</span>
        </div>
        {!expanded && exec.output && (
          <div className="text-xs text-gray-500 mt-1 truncate">{exec.output.slice(0, 120)}...</div>
        )}
      </button>

      {expanded && (
        <div className="border-t p-3">
          {exec.error && (
            <div className="text-sm text-red-600 bg-red-50 rounded p-2 mb-2">{exec.error}</div>
          )}
          {exec.output && (
            <pre className="text-xs text-gray-600 bg-gray-50 rounded p-3 mb-3 max-h-96 overflow-auto whitespace-pre-wrap">
              {exec.output}
            </pre>
          )}
          <div className="flex gap-2 flex-wrap">
            {exec.status === "completed" && nextAgent && (
              <Link
                href={`/agents/${nextAgent.key}?fromExec=${exec.id}&field=${nextAgent.field}`}
                className="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
              >
                Use as input for {nextAgent.key}
              </Link>
            )}
            {exec.status === "completed" && (
              <button
                onClick={promoteToArtifact}
                disabled={promoting}
                className="text-xs bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700 disabled:opacity-50"
              >
                {promoting ? "Creating..." : "Create Artifact"}
              </button>
            )}
            <button
              onClick={() => navigator.clipboard.writeText(exec.output)}
              className="text-xs bg-gray-100 text-gray-600 px-3 py-1 rounded hover:bg-gray-200"
            >
              Copy Output
            </button>
          </div>

          {/* Inline retry buttons for failed executions */}
          {exec.status === "failed" && providers.some((p) => p.available) && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t flex-wrap">
              <span className="text-xs text-gray-500">Retry with:</span>
              {providers.filter((p) => p.available).map((p) => (
                <button
                  key={p.id}
                  onClick={() => onRetry(p.id)}
                  className="text-xs px-2 py-1 bg-gray-100 hover:bg-blue-100 border rounded"
                >
                  {p.displayName}
                </button>
              ))}
            </div>
          )}

          {exec.parentExec && (
            <div className="text-xs text-gray-400 mt-2">
              Input from: <Link href={`/agents/${exec.parentExec.agentKey}/${exec.parentExec.id}`} className="text-blue-500 hover:underline">
                {exec.parentExec.agentKey} ({exec.parentExec.id.slice(0, 8)}...)
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
