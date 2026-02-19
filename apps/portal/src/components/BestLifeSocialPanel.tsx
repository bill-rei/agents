"use client";

import { useState, useEffect } from "react";
import CharCount from "./CharCount";

// ── Types (mirror server-side shapes without importing server modules) ─────────

interface ChannelConfig {
  key: string;
  label: string;
  profileUrl: string;
  publishMode: "direct" | "assist";
  charLimit: number;
  supportsText: boolean;
  notes?: string;
}

interface ChannelPreview {
  key: string;
  label: string;
  mode: "direct" | "assist";
  postText: string;
  characterCount: number;
  charLimit: number;
  withinLimit: boolean;
}

interface ChannelResult {
  mode: "direct" | "assist";
  status: "success" | "failed" | "skipped";
  postId?: string;
  postUrl?: string;
  error?: string;
  durationMs: number;
}

interface PublishJob {
  id: string;
  status: string;
  directChannels: string[];
  assistChannels: string[];
  channelResults: Record<string, ChannelResult>;
  assistPackPath: string | null;
  dryRun: boolean;
}

interface Artifact {
  id: string;
  type: string;
  title: string;
  status: string;
  content: string;
  metadata: Record<string, unknown>;
}

// ── Hardcoded channel list (loaded from API to avoid server imports) ────────────

// Matches bestlife-social.json — keeps UI self-contained
const BESTLIFE_CHANNELS: ChannelConfig[] = [
  { key: "x_profile",             label: "X (Twitter)",          profileUrl: "https://x.com/getbestlifeapp",                    publishMode: "direct", charLimit: 280,   supportsText: true  },
  { key: "linkedin_company_page", label: "LinkedIn Company Page", profileUrl: "https://www.linkedin.com/company/best-life-inc",  publishMode: "direct", charLimit: 3000,  supportsText: true  },
  { key: "facebook_page",         label: "Facebook Page",         profileUrl: "https://www.facebook.com/getbestlifeapp/",        publishMode: "direct", charLimit: 63206, supportsText: true  },
  { key: "instagram_profile",     label: "Instagram",             profileUrl: "https://www.instagram.com/getbestlifeapp",        publishMode: "assist", charLimit: 2200,  supportsText: false },
  { key: "threads_profile",       label: "Threads",               profileUrl: "https://www.threads.com/@getbestlifeapp",         publishMode: "assist", charLimit: 500,   supportsText: true  },
  { key: "bluesky_profile",       label: "BlueSky",               profileUrl: "https://bsky.app/profile/getbestlifeapp.bsky.social", publishMode: "assist", charLimit: 300, supportsText: true },
  { key: "reddit_community",      label: "Reddit (r/bestlifeapp)", profileUrl: "https://www.reddit.com/r/bestlifeapp/",          publishMode: "assist", charLimit: 40000, supportsText: true  },
  { key: "youtube_channel",       label: "YouTube",               profileUrl: "https://www.youtube.com/@getbestlifeapp",         publishMode: "assist", charLimit: 500,   supportsText: false },
  { key: "tiktok_business_profile", label: "TikTok",              profileUrl: "https://www.tiktok.com/@getbestlifeapp",          publishMode: "assist", charLimit: 2200,  supportsText: false },
];

const DIRECT_CHANNELS = BESTLIFE_CHANNELS.filter((c) => c.publishMode === "direct");
const ASSIST_CHANNELS  = BESTLIFE_CHANNELS.filter((c) => c.publishMode === "assist");

// ── Helpers ────────────────────────────────────────────────────────────────────

function truncateForChannel(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const slice = text.slice(0, limit - 1);
  const lastSpace = slice.lastIndexOf(" ");
  return (lastSpace > 0 ? slice.slice(0, lastSpace) : slice) + "…";
}

function buildPreviewText(body: string, ch: ChannelConfig): string {
  return truncateForChannel(body, ch.charLimit);
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function BestLifeSocialPanel({ runId }: { runId: string }) {
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [selectedArtifactId, setSelectedArtifactId] = useState("");
  const [selectedChannels, setSelectedChannels] = useState<string[]>(
    BESTLIFE_CHANNELS.map((c) => c.key) // default all selected
  );
  const [scheduledAt, setScheduledAt] = useState("");
  const [showPreviews, setShowPreviews] = useState(false);
  const [dryRunPreviews, setDryRunPreviews] = useState<ChannelPreview[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [job, setJob] = useState<PublishJob | null>(null);
  const [error, setError] = useState("");
  const [recentJobs, setRecentJobs] = useState<PublishJob[]>([]);

  // Load approved BestLife social_post artifacts for this run
  useEffect(() => {
    fetch(`/api/runs/${runId}/artifacts`)
      .then((r) => r.json())
      .then((arts: Artifact[]) => {
        const bestlife = arts.filter(
          (a) =>
            a.type === "social_post" &&
            ["approved", "published"].includes(a.status) &&
            String(a.metadata?.brand || "").toLowerCase() === "bestlife"
        );
        setArtifacts(bestlife);
        if (bestlife.length > 0 && !selectedArtifactId) {
          setSelectedArtifactId(bestlife[0].id);
        }
      });
  }, [runId, selectedArtifactId]);

  // Load preview body from selected artifact
  const [previewBody, setPreviewBody] = useState("");
  useEffect(() => {
    if (!selectedArtifactId) return;
    fetch(`/api/runs/${runId}/artifacts`)
      .then((r) => r.json())
      .then((arts: Artifact[]) => {
        const a = arts.find((x) => x.id === selectedArtifactId);
        if (a) {
          // artifacts store content as JSON or plain text
          try {
            const parsed = JSON.parse(a.content || "{}");
            setPreviewBody(
              String(parsed.body || parsed.excerpt || a.title || "")
            );
          } catch {
            setPreviewBody(a.title || "");
          }
        }
      });
  }, [selectedArtifactId, runId]);

  // Load recent publish jobs for selected artifact
  useEffect(() => {
    if (!selectedArtifactId) return;
    fetch(`/api/publish/bestlife/social?artifactId=${selectedArtifactId}`)
      .then((r) => r.json())
      .then((jobs: PublishJob[]) => {
        if (Array.isArray(jobs)) setRecentJobs(jobs);
      })
      .catch(() => {});
  }, [selectedArtifactId, job]);

  function toggleChannel(key: string) {
    setSelectedChannels((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  function selectAll() {
    setSelectedChannels(BESTLIFE_CHANNELS.map((c) => c.key));
  }

  function selectNone() {
    setSelectedChannels([]);
  }

  async function runDryRun() {
    if (!selectedArtifactId || selectedChannels.length === 0) return;
    setError("");
    const res = await fetch("/api/publish/bestlife/social", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        artifactId: selectedArtifactId,
        selectedChannels,
        dryRun: true,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Dry run failed");
      return;
    }
    setDryRunPreviews(data.preview?.channelPreviews || []);
    setShowPreviews(true);
  }

  async function publish() {
    if (!selectedArtifactId || selectedChannels.length === 0) return;
    setPublishing(true);
    setError("");
    setJob(null);

    const res = await fetch("/api/publish/bestlife/social", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        artifactId: selectedArtifactId,
        selectedChannels,
        scheduledAt: scheduledAt || undefined,
        dryRun: false,
      }),
    });

    const data = await res.json();
    setPublishing(false);

    if (!res.ok) {
      setError(data.error || "Publish failed");
      return;
    }

    setJob(data as PublishJob);
  }

  async function downloadAssistPack(jobId: string, format: "json" | "md") {
    const res = await fetch(
      `/api/publish/bestlife/jobs/${jobId}/assist-pack?format=${format}`
    );
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bestlife-assist-pack.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (artifacts.length === 0) {
    return (
      <div className="bg-orange-50 border border-orange-200 rounded p-4">
        <h3 className="text-sm font-bold text-orange-800 mb-1">Best Life — Direct Publish + Assist Pack</h3>
        <p className="text-xs text-gray-500">
          No approved Best Life social posts found for this run. Create and approve a{" "}
          <code>social_post</code> artifact with <code>brand: "bestlife"</code> to enable publishing.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-orange-50 border border-orange-200 rounded p-4 mb-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold text-orange-800">
            Best Life — Direct Publish + Assist Pack
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Direct API publish to X, LinkedIn, Facebook. Assist pack for all others.
          </p>
        </div>
        <span className="text-xs bg-orange-200 text-orange-800 px-2 py-0.5 rounded font-medium">
          Best Life only
        </span>
      </div>

      {/* Artifact selector */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-gray-500 mb-1">Artifact:</label>
        <select
          value={selectedArtifactId}
          onChange={(e) => setSelectedArtifactId(e.target.value)}
          className="w-full border rounded px-3 py-2 text-sm"
        >
          {artifacts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.title || "(untitled)"} [{a.status}]
            </option>
          ))}
        </select>
      </div>

      {/* Channel selection */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-gray-500">Channels:</label>
          <div className="flex gap-2">
            <button onClick={selectAll} className="text-xs text-blue-500 hover:underline">All</button>
            <button onClick={selectNone} className="text-xs text-blue-500 hover:underline">None</button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {/* Direct channels */}
          <div>
            <div className="text-[10px] font-semibold text-green-700 uppercase tracking-wide mb-1 px-1">
              Direct API Publish
            </div>
            {DIRECT_CHANNELS.map((ch) => (
              <ChannelCheckbox
                key={ch.key}
                channel={ch}
                checked={selectedChannels.includes(ch.key)}
                onToggle={() => toggleChannel(ch.key)}
                previewBody={previewBody}
              />
            ))}
          </div>

          {/* Assist channels */}
          <div>
            <div className="text-[10px] font-semibold text-purple-700 uppercase tracking-wide mb-1 px-1">
              Assist Pack (manual post)
            </div>
            {ASSIST_CHANNELS.map((ch) => (
              <ChannelCheckbox
                key={ch.key}
                channel={ch}
                checked={selectedChannels.includes(ch.key)}
                onToggle={() => toggleChannel(ch.key)}
                previewBody={previewBody}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Schedule (optional) */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-gray-500 mb-1">
          Scheduled post time (optional — for assist pack reference):
        </label>
        <input
          type="datetime-local"
          value={scheduledAt}
          onChange={(e) => setScheduledAt(e.target.value)}
          className="border rounded px-3 py-2 text-sm"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="mb-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">
          {error}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={runDryRun}
          disabled={selectedChannels.length === 0 || !selectedArtifactId}
          className="text-sm border border-orange-400 text-orange-700 px-4 py-2 rounded hover:bg-orange-100 disabled:opacity-50"
        >
          Preview
        </button>
        <button
          onClick={publish}
          disabled={publishing || selectedChannels.length === 0 || !selectedArtifactId}
          className="text-sm bg-orange-600 hover:bg-orange-700 text-white px-6 py-2 rounded font-medium disabled:opacity-50"
        >
          {publishing
            ? "Publishing…"
            : `Publish Direct + Generate Assist Pack (${selectedChannels.length} channel${selectedChannels.length !== 1 ? "s" : ""})`}
        </button>
      </div>

      {/* Dry-run previews */}
      {showPreviews && dryRunPreviews.length > 0 && (
        <div className="mb-4 border border-orange-200 rounded bg-white">
          <div className="flex items-center justify-between px-4 py-2 border-b">
            <span className="text-xs font-bold text-gray-600">Channel Previews</span>
            <button
              onClick={() => setShowPreviews(false)}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Close
            </button>
          </div>
          <div className="divide-y">
            {dryRunPreviews.map((p) => (
              <div key={p.key} className="p-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                      p.mode === "direct"
                        ? "bg-green-100 text-green-700"
                        : "bg-purple-100 text-purple-700"
                    }`}>
                      {p.mode === "direct" ? "DIRECT" : "ASSIST"}
                    </span>
                    <span className="text-xs font-medium text-gray-700">{p.label}</span>
                  </div>
                  <CharCount text={p.postText} limit={p.charLimit} />
                </div>
                <pre className="text-xs text-gray-600 bg-gray-50 rounded p-2 whitespace-pre-wrap max-h-24 overflow-auto">
                  {p.postText}
                </pre>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Job result */}
      {job && (
        <JobResultPanel job={job} onDownload={downloadAssistPack} />
      )}

      {/* Recent jobs */}
      {recentJobs.length > 0 && !job && (
        <div className="mt-4">
          <div className="text-xs font-medium text-gray-500 mb-2">Recent publish jobs:</div>
          <div className="space-y-2">
            {recentJobs.slice(0, 3).map((j) => (
              <div key={j.id} className="border rounded p-3 text-xs bg-white">
                <div className="flex items-center justify-between mb-1">
                  <StatusChip status={j.status} />
                  {j.dryRun && <span className="text-gray-400">(dry run)</span>}
                </div>
                {j.assistPackPath && (
                  <div className="flex gap-2 mt-1">
                    <button
                      onClick={() => downloadAssistPack(j.id, "json")}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Download JSON Pack
                    </button>
                    <button
                      onClick={() => downloadAssistPack(j.id, "md")}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Download Markdown
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ChannelCheckbox({
  channel,
  checked,
  onToggle,
  previewBody,
}: {
  channel: ChannelConfig;
  checked: boolean;
  onToggle: () => void;
  previewBody: string;
}) {
  const preview = buildPreviewText(previewBody, channel);
  const charCount = preview.length;
  const overLimit = charCount > channel.charLimit;

  return (
    <label
      className={`flex items-start gap-2 px-3 py-2 rounded border mb-1 cursor-pointer text-sm
        ${checked ? "bg-white border-gray-300" : "bg-white/60 border-gray-200"}
      `}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="mt-0.5 rounded"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="font-medium text-gray-700 truncate">{channel.label}</span>
          {previewBody && (
            <CharCount text={preview} limit={channel.charLimit} />
          )}
        </div>
        {overLimit && previewBody && (
          <div className="text-[10px] text-red-500 mt-0.5">
            Will be auto-truncated to {channel.charLimit} chars
          </div>
        )}
      </div>
    </label>
  );
}

function JobResultPanel({
  job,
  onDownload,
}: {
  job: PublishJob;
  onDownload: (jobId: string, format: "json" | "md") => void;
}) {
  return (
    <div className="border border-orange-300 rounded bg-white p-4">
      <div className="flex items-center gap-2 mb-3">
        <StatusChip status={job.status} />
        <span className="text-xs text-gray-500">Job {job.id.slice(0, 8)}…</span>
      </div>

      {/* Per-channel results */}
      <div className="space-y-1 mb-3">
        {Object.entries(job.channelResults).map(([key, result]) => {
          const ch = BESTLIFE_CHANNELS.find((c) => c.key === key);
          return (
            <div key={key} className="flex items-center justify-between text-xs py-1 border-b last:border-0">
              <div className="flex items-center gap-2">
                <span className={`w-16 text-center rounded text-[10px] px-1 py-0.5 font-medium ${
                  result.mode === "direct"
                    ? "bg-green-100 text-green-700"
                    : "bg-purple-100 text-purple-700"
                }`}>
                  {result.mode === "direct" ? "DIRECT" : "ASSIST"}
                </span>
                <span className="text-gray-700">{ch?.label || key}</span>
              </div>
              <div className="flex items-center gap-2">
                {result.status === "success" && result.postUrl ? (
                  <a
                    href={result.postUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-500 hover:underline"
                  >
                    View post ↗
                  </a>
                ) : result.status === "success" ? (
                  <span className="text-green-600">✓ Success</span>
                ) : result.status === "skipped" ? (
                  <span className="text-gray-400">— Skipped</span>
                ) : (
                  <span className="text-red-500" title={result.error}>✗ Failed</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Assist pack download */}
      {job.assistPackPath && (
        <div className="bg-purple-50 border border-purple-200 rounded p-3">
          <div className="text-xs font-medium text-purple-800 mb-2">
            Publish Assist Pack ready — download and follow channel-specific instructions:
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => onDownload(job.id, "json")}
              className="text-xs bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded"
            >
              Download JSON Pack
            </button>
            <button
              onClick={() => onDownload(job.id, "md")}
              className="text-xs bg-white border border-purple-400 text-purple-700 hover:bg-purple-50 px-3 py-1.5 rounded"
            >
              Download Markdown
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const styles: Record<string, string> = {
    completed: "bg-green-100 text-green-700",
    partial:   "bg-yellow-100 text-yellow-700",
    running:   "bg-blue-100 text-blue-700",
    pending:   "bg-gray-100 text-gray-600",
    failed:    "bg-red-100 text-red-700",
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${styles[status] || styles.pending}`}>
      {status.toUpperCase()}
    </span>
  );
}
