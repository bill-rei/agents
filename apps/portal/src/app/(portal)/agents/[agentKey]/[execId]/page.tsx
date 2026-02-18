"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";

interface ExecDetail {
  id: string;
  agentKey: string;
  status: string;
  inputs: Record<string, string>;
  output: string;
  error: string | null;
  durationMs: number | null;
  createdAt: string;
  createdBy: { name: string };
  parentExec: { id: string; agentKey: string } | null;
  childExecs: { id: string; agentKey: string; status: string; createdAt: string }[];
}

export default function ExecutionDetailPage() {
  const { agentKey, execId } = useParams<{ agentKey: string; execId: string }>();
  const [exec, setExec] = useState<ExecDetail | null>(null);

  useEffect(() => {
    fetch(`/api/agents/executions/${execId}`)
      .then((r) => r.json())
      .then(setExec);
  }, [execId]);

  if (!exec) {
    return <p className="text-sm text-gray-500">Loading...</p>;
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/agents/${agentKey}`} className="text-sm text-gray-400 hover:text-gray-600">&larr; {agentKey}</Link>
        <h2 className="text-xl font-bold">Execution Detail</h2>
        <StatusBadge status={exec.status} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="bg-white border rounded p-3 text-sm">
          <div className="text-xs text-gray-400">Agent</div>
          <div className="font-medium">{exec.agentKey}</div>
        </div>
        <div className="bg-white border rounded p-3 text-sm">
          <div className="text-xs text-gray-400">Duration</div>
          <div className="font-medium">{exec.durationMs ? `${(exec.durationMs / 1000).toFixed(1)}s` : "—"}</div>
        </div>
        <div className="bg-white border rounded p-3 text-sm">
          <div className="text-xs text-gray-400">Created</div>
          <div className="font-medium">{new Date(exec.createdAt).toLocaleString()} by {exec.createdBy.name}</div>
        </div>
      </div>

      {/* Lineage */}
      {(exec.parentExec || exec.childExecs.length > 0) && (
        <div className="bg-white border rounded p-4 mb-6">
          <h3 className="text-sm font-bold text-gray-600 mb-2">Lineage</h3>
          {exec.parentExec && (
            <div className="text-sm mb-1">
              Input from:{" "}
              <Link href={`/agents/${exec.parentExec.agentKey}/${exec.parentExec.id}`} className="text-blue-500 hover:underline">
                {exec.parentExec.agentKey} ({exec.parentExec.id.slice(0, 8)}...)
              </Link>
            </div>
          )}
          {exec.childExecs.length > 0 && (
            <div className="text-sm">
              Output used by:{" "}
              {exec.childExecs.map((child, i) => (
                <span key={child.id}>
                  {i > 0 && ", "}
                  <Link href={`/agents/${child.agentKey}/${child.id}`} className="text-blue-500 hover:underline">
                    {child.agentKey}
                  </Link>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Inputs */}
      <div className="bg-white border rounded p-4 mb-6">
        <h3 className="text-sm font-bold text-gray-600 mb-2">Inputs</h3>
        {Object.keys(exec.inputs).length === 0 ? (
          <p className="text-sm text-gray-400">No inputs provided</p>
        ) : (
          <div className="space-y-2">
            {Object.entries(exec.inputs).map(([key, value]) => (
              value ? (
                <div key={key}>
                  <div className="text-xs font-medium text-gray-500">{key}</div>
                  <pre className="text-xs text-gray-600 bg-gray-50 rounded p-2 max-h-40 overflow-auto whitespace-pre-wrap">
                    {String(value)}
                  </pre>
                </div>
              ) : null
            ))}
          </div>
        )}
      </div>

      {/* Output */}
      <div className="bg-white border rounded p-4 mb-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-bold text-gray-600">Output</h3>
          {exec.output && (
            <button
              onClick={() => navigator.clipboard.writeText(exec.output)}
              className="text-xs bg-gray-100 text-gray-600 px-3 py-1 rounded hover:bg-gray-200"
            >
              Copy
            </button>
          )}
        </div>
        {exec.error && (
          <div className="text-sm text-red-600 bg-red-50 rounded p-3 mb-3">{exec.error}</div>
        )}
        {exec.output ? (
          <pre className="text-xs text-gray-600 bg-gray-50 rounded p-3 max-h-[600px] overflow-auto whitespace-pre-wrap">
            {exec.output}
          </pre>
        ) : (
          <p className="text-sm text-gray-400">No output</p>
        )}
      </div>
    </div>
  );
}
