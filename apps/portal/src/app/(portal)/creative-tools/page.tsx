"use client";

import { useEffect, useState, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface JobInput {
  brandKey:      string;
  campaignSlug?: string;
  campaignTitle?: string;
  force:         boolean;
}

interface JobOutput {
  brandKey?:     string;
  campaignSlug?: string;
  generated?:    string[];
  skipped?:      string[];
  warnings?:     string[];
}

interface JobRecord {
  id:        string;
  status:    "pending" | "running" | "completed" | "failed";
  input:     JobInput;
  output:    JobOutput | null;
  error:     string | null;
  createdAt: string;
  updatedAt: string;
}

interface RunResult {
  ok:           boolean;
  jobId:        string;
  brandKey:     string;
  campaignSlug: string;
  generated:    string[];
  skipped:      string[];
  warnings:     string[];
}

const BRANDS    = ["LLIF", "BestLife"] as const;
const CUR_MONTH = new Date().toISOString().slice(0, 7);

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CreativeToolsPage() {
  const [brandKey,      setBrandKey]      = useState("LLIF");
  const [campaignSlug,  setCampaignSlug]  = useState("");
  const [campaignTitle, setCampaignTitle] = useState("");
  const [keyMessage,    setKeyMessage]    = useState("");
  const [cta,           setCta]           = useState("");
  const [campaignMonth, setCampaignMonth] = useState(CUR_MONTH);
  const [force,         setForce]         = useState(false);
  const [running,       setRunning]       = useState(false);
  const [lastResult,    setLastResult]    = useState<RunResult | null>(null);
  const [error,         setError]         = useState<string | null>(null);
  const [jobs,          setJobs]          = useState<JobRecord[]>([]);
  const [loadingJobs,   setLoadingJobs]   = useState(true);

  const fetchJobs = useCallback(async () => {
    try {
      const res  = await fetch("/api/agents/creative-pack-generator");
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
      const res  = await fetch("/api/agents/creative-pack-generator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandKey,
          campaignSlug:  campaignSlug  || undefined,
          campaignTitle: campaignTitle || undefined,
          keyMessage:    keyMessage    || undefined,
          cta:           cta           || undefined,
          campaignMonth: campaignMonth || undefined,
          force,
        }),
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

  const canRun = !running && (campaignSlug.trim() || campaignTitle.trim());

  return (
    <div className="max-w-3xl">
      <h2 className="text-xl font-bold mb-1">Creative Tools</h2>
      <p className="text-sm text-gray-500 mb-6">
        Generate platform-sized images, LinkedIn &amp; X copy variants, and a Canva upload bundle
        from an approved campaign.
      </p>

      {/* ── Form ────────────────────────────────────────────────────────────── */}
      <div className="bg-white border rounded p-5 mb-6">
        <h3 className="text-sm font-semibold mb-4 text-gray-700">Creative Pack Generator</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          {/* Brand */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Brand *</label>
            <select
              value={brandKey} onChange={(e) => setBrandKey(e.target.value)}
              disabled={running}
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-50"
            >
              {BRANDS.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>

          {/* Month */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Campaign Month
              <span className="ml-1 font-normal text-gray-400">(YYYY-MM)</span>
            </label>
            <input
              type="text" value={campaignMonth}
              onChange={(e) => setCampaignMonth(e.target.value)}
              placeholder="2026-03"
              disabled={running}
              className="w-full border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-50"
            />
          </div>

          {/* Campaign slug */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Campaign Slug
              <span className="ml-1 font-normal text-gray-400">(or provide title below)</span>
            </label>
            <input
              type="text" value={campaignSlug}
              onChange={(e) => setCampaignSlug(e.target.value)}
              placeholder="health-is-personal-not-prescribed"
              disabled={running}
              className="w-full border rounded px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-50"
            />
          </div>

          {/* Campaign title */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Campaign Title</label>
            <input
              type="text" value={campaignTitle}
              onChange={(e) => setCampaignTitle(e.target.value)}
              placeholder="Health is Personal, Not Prescribed"
              disabled={running}
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-50"
            />
          </div>
        </div>

        {/* Key message */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">Key Message</label>
          <input
            type="text" value={keyMessage}
            onChange={(e) => setKeyMessage(e.target.value)}
            placeholder="Health is a pattern, not a point."
            disabled={running}
            className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-50"
          />
        </div>

        {/* CTA */}
        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">CTA</label>
          <input
            type="text" value={cta}
            onChange={(e) => setCta(e.target.value)}
            placeholder="Start tracking what matters."
            disabled={running}
            className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-50"
          />
        </div>

        {/* Force + run */}
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-gray-600 select-none">
            <input
              type="checkbox" checked={force}
              onChange={(e) => setForce(e.target.checked)}
              disabled={running}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
            />
            Force overwrite existing files
          </label>

          <button
            onClick={handleRun} disabled={!canRun}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm font-medium px-5 py-2 rounded transition-colors"
          >
            {running ? "Generating…" : "Generate Creative Pack"}
          </button>
        </div>

        {!canRun && !running && (
          <p className="mt-2 text-xs text-amber-600">Enter a campaign slug or title to enable.</p>
        )}

        {/* Path preview */}
        {(campaignSlug || campaignTitle) && (
          <p className="mt-3 text-xs text-gray-400">
            Output path:{" "}
            <code className="bg-gray-50 px-1 rounded">
              campaigns/{campaignMonth}/{brandKey}/
              {campaignSlug || campaignTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-")}/
              creative-pack/
            </code>
          </p>
        )}
      </div>

      {/* ── Error ───────────────────────────────────────────────────────────── */}
      {error && (
        <div className="mb-6 border border-red-200 bg-red-50 rounded p-4 text-sm text-red-700">
          <span className="font-semibold">Error:</span> {error}
        </div>
      )}

      {/* ── Last result ──────────────────────────────────────────────────────── */}
      {lastResult && (
        <div className="mb-8 border rounded p-5 bg-white">
          <div className="flex items-center gap-2 mb-4">
            <StatusBadge status="completed" />
            <span className="text-sm font-semibold">
              {lastResult.brandKey} / {lastResult.campaignSlug}
            </span>
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

          <FileList label="Generated" files={lastResult.generated} />
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
            {jobs.map((job) => <JobRow key={job.id} job={job} />)}
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
  const slug = job.input.campaignSlug ?? job.input.campaignTitle ?? "—";

  return (
    <div className="border rounded bg-white">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <StatusBadge status={job.status} />
        <span className="text-sm font-medium flex-1">
          {job.input.brandKey} / <span className="font-mono text-xs">{slug}</span>
          {job.input.force && <span className="ml-2 text-xs text-orange-600 font-normal">(force)</span>}
        </span>
        <span className="text-xs text-gray-400">{formatDate(job.createdAt)}</span>
        {job.status === "completed" && (
          <span className="text-xs text-gray-400">{gen} generated</span>
        )}
        <span className="text-gray-300 text-xs">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t px-4 py-3 text-xs">
          {job.status === "failed" && job.error && (
            <p className="text-red-600 mb-2">
              <span className="font-semibold">Error:</span> {job.error}
            </p>
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
            <FileList label="Generated" files={job.output.generated} />
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

function FileList({ label, files }: { label: string; files: string[] }) {
  const images = files.filter((f) => f.endsWith(".png") || f.endsWith(".jpg"));
  const copy   = files.filter((f) => f.endsWith(".md"));
  const other  = files.filter((f) => !f.endsWith(".png") && !f.endsWith(".jpg") && !f.endsWith(".md"));

  return (
    <details>
      <summary className="text-xs font-semibold text-gray-600 cursor-pointer select-none list-none flex items-center gap-1">
        <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
        {label} ({files.length})
        {images.length > 0 && <span className="ml-2 text-gray-400 font-normal">{images.length} images</span>}
        {copy.length   > 0 && <span className="ml-1 text-gray-400 font-normal">{copy.length} copy files</span>}
      </summary>
      <div className="mt-2 pl-3 space-y-2">
        {images.length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">Images</p>
            <ul className="font-mono text-xs text-gray-500 space-y-0.5">
              {images.map((f, i) => <li key={i}>{f.split("/").pop()}</li>)}
            </ul>
          </div>
        )}
        {copy.length > 0 && (
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">Copy</p>
            <ul className="font-mono text-xs text-gray-500 space-y-0.5">
              {copy.map((f, i) => <li key={i}>{f.split("/").pop()}</li>)}
            </ul>
          </div>
        )}
        {other.length > 0 && (
          <ul className="font-mono text-xs text-gray-500 space-y-0.5 max-h-32 overflow-y-auto">
            {other.map((f, i) => <li key={i}>{f}</li>)}
          </ul>
        )}
      </div>
    </details>
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
  const colors: Record<string, string> = { green: "text-green-700", gray: "text-gray-500", amber: "text-amber-700" };
  return (
    <div className="text-center">
      <div className={`text-xl font-bold ${colors[color] ?? "text-gray-700"}`}>{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}
