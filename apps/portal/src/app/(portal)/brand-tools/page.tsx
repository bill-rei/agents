"use client";

import { useEffect, useState, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface JobRecord {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  input: { brandKey: string; force: boolean };
  output: {
    brandKey?: string;
    generated?: string[];
    skipped?: string[];
    warnings?: string[];
    result?: string;
  } | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

interface RunResult {
  ok: boolean;
  jobId: string;
  brandKey: string;
  generated: string[];
  skipped: string[];
  warnings: string[];
  result: string;
}

const BRANDS = ["LLIF", "BestLife"] as const;

// ── Page component ────────────────────────────────────────────────────────────

export default function BrandToolsPage() {
  const [brandKey, setBrandKey]   = useState<string>("LLIF");
  const [force, setForce]         = useState(false);
  const [running, setRunning]     = useState(false);
  const [lastResult, setLastResult] = useState<RunResult | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const [jobs, setJobs]           = useState<JobRecord[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);

  const fetchJobs = useCallback(async () => {
    try {
      const res  = await fetch("/api/agents/brand-asset-compiler");
      const data = await res.json() as { jobs: JobRecord[] };
      setJobs(data.jobs ?? []);
    } finally {
      setLoadingJobs(false);
    }
  }, []);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  async function handleRun() {
    setRunning(true);
    setLastResult(null);
    setError(null);

    try {
      const res = await fetch("/api/agents/brand-asset-compiler", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandKey, force }),
      });
      const data = await res.json() as RunResult & { error?: string };
      if (!res.ok || data.error) {
        setError(data.error ?? `HTTP ${res.status}`);
      } else {
        setLastResult(data);
        await fetchJobs();
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <h2 className="text-xl font-bold mb-1">Brand Tools</h2>
      <p className="text-sm text-gray-500 mb-6">
        Generate favicon sets, social packs, OG images, Next.js assets, and a Canva upload bundle
        from your master SVG logo.
      </p>

      {/* ── Run form ─────────────────────────────────────────────────────── */}
      <div className="bg-white border rounded p-5 mb-8">
        <h3 className="text-sm font-semibold mb-4 text-gray-700">Brand Asset Compiler</h3>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          {/* Brand selector */}
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-600 mb-1">Brand</label>
            <select
              value={brandKey}
              onChange={(e) => setBrandKey(e.target.value)}
              disabled={running}
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-50"
            >
              {BRANDS.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          </div>

          {/* Force toggle */}
          <div className="flex items-center gap-2 pb-2">
            <input
              id="force"
              type="checkbox"
              checked={force}
              onChange={(e) => setForce(e.target.checked)}
              disabled={running}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
            />
            <label htmlFor="force" className="text-sm text-gray-600 select-none">
              Force overwrite existing files
            </label>
          </div>

          {/* Run button */}
          <button
            onClick={handleRun}
            disabled={running}
            className="shrink-0 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-medium px-5 py-2 rounded transition-colors"
          >
            {running ? "Running…" : "Run Brand Asset Compiler"}
          </button>
        </div>

        {/* Input path hint */}
        <p className="mt-3 text-xs text-gray-400">
          Source SVG expected at:{" "}
          <code className="bg-gray-50 px-1 rounded">
            marketing-ops-shared-content/brand/{brandKey}/source/logo-master.svg
          </code>
        </p>
      </div>

      {/* ── Error ───────────────────────────────────────────────────────────── */}
      {error && (
        <div className="mb-6 border border-red-200 bg-red-50 rounded p-4 text-sm text-red-700">
          <span className="font-semibold">Error: </span>{error}
        </div>
      )}

      {/* ── Last run result ──────────────────────────────────────────────────── */}
      {lastResult && (
        <div className="mb-8 border rounded p-5 bg-white">
          <div className="flex items-center gap-2 mb-4">
            <StatusBadge status="completed" />
            <span className="text-sm font-semibold">{lastResult.brandKey} — run complete</span>
          </div>

          <div className="flex gap-6 mb-4 text-sm">
            <Stat label="Generated" value={lastResult.generated.length} color="green" />
            <Stat label="Skipped"   value={lastResult.skipped.length}   color="gray"  />
            <Stat label="Warnings"  value={lastResult.warnings.length}  color="amber" />
          </div>

          {lastResult.warnings.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-semibold text-amber-700 mb-1">Warnings</p>
              <ul className="text-xs text-amber-700 list-disc list-inside space-y-0.5">
                {lastResult.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}

          {lastResult.generated.length > 0 && (
            <details className="group">
              <summary className="text-xs font-semibold text-gray-600 cursor-pointer select-none list-none flex items-center gap-1">
                <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
                Generated files ({lastResult.generated.length})
              </summary>
              <ul className="mt-2 text-xs font-mono text-gray-500 space-y-0.5 pl-4 max-h-64 overflow-y-auto">
                {lastResult.generated.map((f, i) => <li key={i}>{f}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}

      {/* ── Job history ──────────────────────────────────────────────────────── */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Recent Jobs</h3>
        {loadingJobs ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : jobs.length === 0 ? (
          <p className="text-sm text-gray-400">No jobs yet.</p>
        ) : (
          <div className="space-y-2">
            {jobs.map((job) => (
              <JobRow key={job.id} job={job} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function JobRow({ job }: { job: JobRecord }) {
  const [open, setOpen] = useState(false);
  const gen = job.output?.generated?.length ?? 0;
  const skp = job.output?.skipped?.length   ?? 0;

  return (
    <div className="border rounded bg-white">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <StatusBadge status={job.status} />
        <span className="text-sm font-medium flex-1">
          {job.input.brandKey}
          {job.input.force && (
            <span className="ml-2 text-xs text-orange-600 font-normal">(force)</span>
          )}
        </span>
        <span className="text-xs text-gray-400">{formatDate(job.createdAt)}</span>
        {job.status === "completed" && (
          <span className="text-xs text-gray-400">{gen} generated, {skp} skipped</span>
        )}
        <span className="text-gray-300 text-xs">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t px-4 py-3 text-xs">
          {job.status === "failed" && job.error && (
            <p className="text-red-600 mb-2"><span className="font-semibold">Error:</span> {job.error}</p>
          )}
          {job.output?.warnings && job.output.warnings.length > 0 && (
            <div className="mb-2">
              <p className="font-semibold text-amber-700 mb-1">Warnings</p>
              <ul className="list-disc list-inside text-amber-700 space-y-0.5">
                {job.output.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}
          {job.output?.generated && job.output.generated.length > 0 && (
            <details>
              <summary className="font-semibold text-gray-600 cursor-pointer select-none">
                Generated files ({gen})
              </summary>
              <ul className="mt-1 font-mono text-gray-500 space-y-0.5 pl-3 max-h-48 overflow-y-auto">
                {job.output.generated.map((f, i) => <li key={i}>{f}</li>)}
              </ul>
            </details>
          )}
          {job.output?.skipped && job.output.skipped.length > 0 && (
            <details className="mt-2">
              <summary className="font-semibold text-gray-500 cursor-pointer select-none">
                Skipped ({skp})
              </summary>
              <ul className="mt-1 font-mono text-gray-400 space-y-0.5 pl-3 max-h-32 overflow-y-auto">
                {job.output.skipped.map((f, i) => <li key={i}>{f}</li>)}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending:   "bg-gray-100 text-gray-600",
    running:   "bg-blue-100 text-blue-700",
    completed: "bg-green-100 text-green-700",
    failed:    "bg-red-100 text-red-700",
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${styles[status] ?? styles.pending}`}>
      {status}
    </span>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    green: "text-green-700",
    gray:  "text-gray-500",
    amber: "text-amber-700",
  };
  return (
    <div className="text-center">
      <div className={`text-xl font-bold ${colors[color] ?? "text-gray-700"}`}>{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}
