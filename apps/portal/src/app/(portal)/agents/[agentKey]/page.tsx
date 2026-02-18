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

  // Load agent config
  useEffect(() => {
    fetch("/api/agents")
      .then((r) => r.json())
      .then((data) => {
        const found = (data.agents || []).find((a: AgentInfo) => a.key === agentKey);
        setAgent(found || null);
      });
  }, [agentKey]);

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

  async function runAgent() {
    if (!selectedRunId || !agent) return;
    setExecuting(true);
    try {
      const res = await fetch(`/api/agents/${agentKey}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          runId: selectedRunId,
          inputs,
          parentExecId,
        }),
      });
      const exec = await res.json();
      if (exec.id) {
        setExpandedExec(exec.id);
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

          <button
            onClick={runAgent}
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
                />
              ))}
            </div>
          )}
        </div>
      </div>
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
}: {
  exec: Execution;
  expanded: boolean;
  onToggle: () => void;
  agentKey: string;
}) {
  const [promoting, setPromoting] = useState(false);

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
          <div className="flex items-center gap-2">
            <StatusBadge status={exec.status} />
            <span className="text-gray-600">{new Date(exec.createdAt).toLocaleString()}</span>
            {exec.durationMs && (
              <span className="text-xs text-gray-400">{(exec.durationMs / 1000).toFixed(1)}s</span>
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
          <div className="flex gap-2">
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
