"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { UCSMessage, UCSCanonical, UCSOverrides, UCSBrandMode } from "@/lib/ucs/schema";
import type { RedditExport } from "@/lib/ucs/renderers/redditExport";

// ── Publish types ─────────────────────────────────────────────────────────────

interface PublishJob {
  id: string;
  platform: string;
  status: string;
  scheduledFor: string | null;
  attemptCount: number;
  lastError: string | null;
  events: { id: string; ts: string; level: string; message: string }[];
}

const TERMINAL_STATUSES = new Set(["published", "failed", "dead_letter", "not_supported"]);
const JOB_STATUS_COLORS: Record<string, string> = {
  queued: "bg-gray-100 text-gray-600",
  running: "bg-blue-100 text-blue-700",
  scheduled: "bg-amber-100 text-amber-700",
  published: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-600",
  dead_letter: "bg-red-200 text-red-800",
  not_supported: "bg-amber-100 text-amber-700",
};

interface LogEntry {
  ts: string;
  level: "info" | "warn" | "error";
  message: string;
}

type ChannelKey = "linkedin" | "x" | "instagram" | "tiktok" | "reddit" | "website";

const CHANNEL_LABELS: Record<ChannelKey, string> = {
  linkedin: "LinkedIn",
  x: "X",
  instagram: "Instagram",
  tiktok: "TikTok",
  reddit: "Reddit",
  website: "Website",
};

const BRAND_BADGE: Record<UCSBrandMode, string> = {
  LLIF: "bg-indigo-600 text-white",
  BestLife: "bg-emerald-600 text-white",
};

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  in_review: "bg-amber-100 text-amber-700",
  approved: "bg-green-100 text-green-700",
};

export default function CampaignComposer({ initialMessage }: { initialMessage: UCSMessage }) {
  const [message, setMessage] = useState<UCSMessage>(initialMessage);
  const [canonical, setCanonical] = useState<UCSCanonical>(initialMessage.canonical);
  const [overrides, setOverrides] = useState<UCSOverrides>(initialMessage.overrides);
  const [renders, setRenders] = useState<Record<string, string>>(initialMessage.renders);
  const [activeChannel, setActiveChannel] = useState<ChannelKey>("linkedin");
  const [log, setLog] = useState<LogEntry[]>([]);
  const [isRendering, setIsRendering] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saved" | "error">("idle");
  const logEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Publish state ──────────────────────────────────────────────────────────
  const [publishPlatforms, setPublishPlatforms] = useState<("x" | "linkedin" | "instagram" | "tiktok")[]>(["linkedin", "x"]);
  const [scheduledFor, setScheduledFor] = useState("");
  const [publishMode, setPublishMode] = useState<"now" | "schedule">("now");
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState("");
  const [jobs, setJobs] = useState<PublishJob[]>([]);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function appendLog(entry: LogEntry) {
    setLog((prev) => [...prev, entry]);
    setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }

  // ── Canonical save ─────────────────────────────────────────────────────────

  async function saveCanonical() {
    setIsSaving(true);
    const res = await fetch(`/api/campaigns/${message.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ canonical }),
    });
    setIsSaving(false);
    if (res.ok) {
      const updated = await res.json();
      setMessage(updated);
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 2000);
    } else {
      setSaveState("error");
    }
  }

  // ── Override save ──────────────────────────────────────────────────────────

  async function saveOverride(channel: ChannelKey, channelOverride: unknown) {
    const res = await fetch(`/api/campaigns/${message.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ overrides: { [channel]: channelOverride } }),
    });
    if (res.ok) {
      const updated = await res.json();
      setOverrides(updated.overrides);
    }
  }

  // ── Status update ──────────────────────────────────────────────────────────

  async function updateStatus(status: string) {
    const res = await fetch(`/api/campaigns/${message.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      const updated = await res.json();
      setMessage(updated);
    }
  }

  // ── Render pipeline ────────────────────────────────────────────────────────

  async function generateRenders() {
    setIsRendering(true);
    setLog([]);
    const res = await fetch(`/api/campaigns/${message.id}/render`, { method: "POST" });
    if (res.ok) {
      const data = await res.json() as { renders: Record<string, string>; log: LogEntry[] };
      setRenders(data.renders);
      for (const entry of data.log) appendLog(entry);
    } else {
      appendLog({ ts: new Date().toISOString(), level: "error", message: "Render request failed." });
    }
    setIsRendering(false);
  }

  // ── Media upload ───────────────────────────────────────────────────────────

  async function handleFileUpload(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`/api/campaigns/${message.id}/media`, { method: "POST", body: formData });
    if (res.ok) {
      const { ref } = await res.json();
      appendLog({ ts: new Date().toISOString(), level: "info", message: `Media uploaded: ${ref}` });
      // Append ref to canonical.mediaRefs
      setCanonical((prev) => ({
        ...prev,
        mediaRefs: [...(prev.mediaRefs ?? []), { ref }],
      }));
    }
  }

  // ── Publish pipeline ───────────────────────────────────────────────────────

  function startPolling() {
    if (pollingRef.current) return;
    pollingRef.current = setInterval(async () => {
      const res = await fetch(`/api/publish/jobs?ucsMessageId=${message.id}`);
      if (!res.ok) return;
      const latest = await res.json() as PublishJob[];
      setJobs(latest);
      // Stop polling when all jobs are terminal
      if (latest.length > 0 && latest.every((j) => TERMINAL_STATUSES.has(j.status))) {
        clearInterval(pollingRef.current!);
        pollingRef.current = null;
      }
    }, 3000);
  }

  useEffect(() => () => { if (pollingRef.current) clearInterval(pollingRef.current); }, []);

  async function handlePublish() {
    if (publishPlatforms.length === 0) { setPublishError("Select at least one platform."); return; }
    if (publishMode === "schedule" && !scheduledFor) { setPublishError("Pick a schedule time."); return; }
    setPublishError("");
    setIsPublishing(true);

    const createRes = await fetch("/api/publish/create-jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ucsMessageId: message.id,
        platforms: publishPlatforms,
        approveNow: true,
        scheduledFor: publishMode === "schedule" ? scheduledFor : undefined,
      }),
    });

    if (!createRes.ok) {
      const err = await createRes.json().catch(() => ({})) as { error?: string };
      setPublishError(err.error ?? "Failed to create publish jobs.");
      setIsPublishing(false);
      return;
    }

    const { jobs: created } = await createRes.json() as { jobs: PublishJob[] };
    setJobs(created);

    // For "now" mode: trigger the runner immediately
    if (publishMode === "now") {
      await fetch("/api/publish/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    }

    setIsPublishing(false);
    startPolling();
  }

  // ── Render display helpers ─────────────────────────────────────────────────

  const currentRender = renders[activeChannel];
  let redditData: RedditExport | null = null;
  if (activeChannel === "reddit" && currentRender) {
    try { redditData = JSON.parse(currentRender); } catch { /* ignore */ }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className={`text-xs font-bold px-2.5 py-1 rounded-lg ${BRAND_BADGE[message.brandMode]}`}>
            {message.brandMode}
          </span>
          <h1 className="text-xl font-bold text-gray-900">{message.title}</h1>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[message.status]}`}>
            {message.status.replace("_", " ")}
          </span>
        </div>
        <div className="flex gap-2">
          {message.status === "draft" && (
            <button
              onClick={() => updateStatus("in_review")}
              className="text-xs px-3 py-1.5 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 transition-colors"
            >
              Submit for Review
            </button>
          )}
          {message.status === "in_review" && (
            <button
              onClick={() => updateStatus("approved")}
              className="text-xs px-3 py-1.5 rounded-lg border border-green-300 text-green-700 hover:bg-green-50 transition-colors"
            >
              Approve
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Left: Canonical Editor ── */}
        <div className="space-y-4">
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Canonical Content</h2>

            <div className="space-y-4">
              <Field label="Hook">
                <input
                  type="text"
                  value={canonical.hook}
                  onChange={(e) => setCanonical((p) => ({ ...p, hook: e.target.value }))}
                  className="input-base"
                  placeholder="Opening hook / attention-grabber"
                />
              </Field>

              <Field label="Body">
                <textarea
                  value={canonical.body}
                  onChange={(e) => setCanonical((p) => ({ ...p, body: e.target.value }))}
                  rows={6}
                  className="input-base resize-none"
                  placeholder="Core message body"
                />
              </Field>

              <Field label="Call to Action">
                <input
                  type="text"
                  value={canonical.callToAction ?? ""}
                  onChange={(e) => setCanonical((p) => ({ ...p, callToAction: e.target.value || undefined }))}
                  className="input-base"
                  placeholder="Optional CTA text"
                />
              </Field>

              <div className="grid grid-cols-2 gap-4">
                <Field label="Tone">
                  <input
                    type="text"
                    value={canonical.tone ?? ""}
                    onChange={(e) => setCanonical((p) => ({ ...p, tone: e.target.value || undefined }))}
                    className="input-base"
                    placeholder="e.g. informative, warm"
                  />
                </Field>
                <Field label="Target Audience">
                  <input
                    type="text"
                    value={canonical.targetAudience ?? ""}
                    onChange={(e) => setCanonical((p) => ({ ...p, targetAudience: e.target.value || undefined }))}
                    className="input-base"
                    placeholder="e.g. health-conscious 35–55"
                  />
                </Field>
              </div>

              <Field label="Hashtags (comma-separated)">
                <input
                  type="text"
                  value={(canonical.hashtags ?? []).join(", ")}
                  onChange={(e) =>
                    setCanonical((p) => ({
                      ...p,
                      hashtags: e.target.value
                        ? e.target.value.split(",").map((t) => t.trim().replace(/^#/, ""))
                        : undefined,
                    }))
                  }
                  className="input-base"
                  placeholder="longevity, healthdata, wellness"
                />
              </Field>

              {/* Media refs */}
              {(canonical.mediaRefs ?? []).length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">
                    Media
                  </label>
                  <ul className="space-y-1">
                    {(canonical.mediaRefs ?? []).map((m, i) => (
                      <li key={i} className="flex items-center gap-2 text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-1.5">
                        <span className="font-mono truncate">{m.ref}</span>
                        <button
                          onClick={() =>
                            setCanonical((p) => ({
                              ...p,
                              mediaRefs: (p.mediaRefs ?? []).filter((_, j) => j !== i),
                            }))
                          }
                          className="text-gray-400 hover:text-red-500 ml-auto"
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* File upload */}
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileUpload(f);
                  }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs text-indigo-500 hover:underline"
                >
                  + Attach media
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3 mt-5">
              <button
                onClick={saveCanonical}
                disabled={isSaving}
                className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {isSaving ? "Saving…" : "Save Canonical"}
              </button>
              {saveState === "saved" && <span className="text-green-600 text-xs font-medium">Saved ✓</span>}
              {saveState === "error" && <span className="text-red-500 text-xs">Save failed</span>}
            </div>
          </section>

          {/* Generate Renders */}
          <button
            onClick={generateRenders}
            disabled={isRendering}
            className="w-full py-3 bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-semibold rounded-xl hover:from-violet-700 hover:to-indigo-700 disabled:opacity-50 transition-all shadow-sm text-sm"
          >
            {isRendering ? "Rendering…" : "⚡ Generate Renders"}
          </button>

          {/* Render Log */}
          {log.length > 0 && (
            <section className="bg-gray-950 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className={`w-2 h-2 rounded-full ${isRendering ? "bg-green-400 animate-pulse" : "bg-gray-600"}`} />
                <span className="text-xs font-mono text-gray-400 uppercase tracking-wider">Render Log</span>
              </div>
              <div className="space-y-0.5 max-h-48 overflow-y-auto">
                {log.map((entry, i) => (
                  <div key={i} className="flex gap-2 font-mono text-[11px] leading-5">
                    <span className="text-gray-600 flex-shrink-0">
                      {entry.ts.slice(11, 19)}
                    </span>
                    <span
                      className={
                        entry.level === "error" ? "text-red-400" :
                        entry.level === "warn" ? "text-amber-400" :
                        "text-green-400"
                      }
                    >
                      {entry.message}
                    </span>
                  </div>
                ))}
                <div ref={logEndRef} />
              </div>
            </section>
          )}
        </div>

        {/* ── Right: Channel Panels ── */}
        <div className="space-y-4">
          {/* Channel tabs */}
          <div className="flex flex-wrap gap-1">
            {(Object.keys(CHANNEL_LABELS) as ChannelKey[]).map((ch) => (
              <button
                key={ch}
                onClick={() => setActiveChannel(ch)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  activeChannel === ch
                    ? "bg-indigo-600 text-white"
                    : "bg-white border border-gray-200 text-gray-600 hover:border-gray-300"
                }`}
              >
                {CHANNEL_LABELS[ch]}
                {renders[ch] && (
                  <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                )}
              </button>
            ))}
          </div>

          {/* Rendered output */}
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              {CHANNEL_LABELS[activeChannel]} — Render
            </h3>

            {!currentRender ? (
              <p className="text-sm text-gray-400 italic py-6 text-center border border-dashed border-gray-200 rounded-xl">
                No render yet. Click "Generate Renders" to produce output.
              </p>
            ) : activeChannel === "reddit" && redditData ? (
              <RedditPanel data={redditData} />
            ) : activeChannel === "website" ? (
              <WebsitePanel markdown={currentRender} />
            ) : (
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
                <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono leading-relaxed">
                  {currentRender}
                </pre>
                <p className="text-right text-xs text-gray-400 mt-2">{currentRender.length} chars</p>
              </div>
            )}
          </section>

          {/* Override editor */}
          <ChannelOverrideEditor
            channel={activeChannel}
            overrides={overrides}
            setOverrides={setOverrides}
            onSave={(ov) => saveOverride(activeChannel, ov)}
          />
        </div>
      </div>
      {/* ── Publish section ── */}
      <PublishSection
        messageId={message.id}
        status={message.status}
        hasRenders={Object.keys(renders).length > 0}
        platforms={publishPlatforms}
        setPlrms={setPublishPlatforms as React.Dispatch<React.SetStateAction<PublishPlatform[]>>}
        publishMode={publishMode}
        setPublishMode={setPublishMode}
        scheduledFor={scheduledFor}
        setScheduledFor={setScheduledFor}
        onPublish={handlePublish}
        isPublishing={isPublishing}
        error={publishError}
        jobs={jobs}
      />
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-400 mb-1.5 uppercase tracking-wide">
        {label}
      </label>
      {children}
    </div>
  );
}

function RedditPanel({ data }: { data: RedditExport }) {
  return (
    <div className="space-y-3">
      <CopyBlock label={`r/${data.subreddit} — Title`} text={data.title} />
      <CopyBlock label="Body" text={data.body} mono />
      {data.firstComment && <CopyBlock label="First Comment" text={data.firstComment} mono />}
    </div>
  );
}

function WebsitePanel({ markdown }: { markdown: string }) {
  return (
    <div>
      <CopyBlock label="Markdown (ready to commit)" text={markdown} mono />
    </div>
  );
}

function CopyBlock({ label, text, mono }: { label: string; text: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</span>
        <button
          onClick={copy}
          className="text-xs text-indigo-500 hover:underline"
        >
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
      <pre
        className={`bg-gray-50 border border-gray-100 rounded-xl p-3 text-xs text-gray-700 whitespace-pre-wrap leading-relaxed ${mono ? "font-mono" : "font-sans"}`}
      >
        {text}
      </pre>
    </div>
  );
}

function ChannelOverrideEditor({
  channel,
  overrides,
  setOverrides,
  onSave,
}: {
  channel: ChannelKey;
  overrides: UCSOverrides;
  setOverrides: React.Dispatch<React.SetStateAction<UCSOverrides>>;
  onSave: (ov: unknown) => void;
}) {
  const ov = overrides[channel] as Record<string, string> | undefined;

  function updateOv(key: string, value: string) {
    setOverrides((prev) => ({
      ...prev,
      [channel]: { ...(prev[channel] as object ?? {}), [key]: value || undefined },
    }));
  }

  const fields =
    channel === "reddit"
      ? ["title", "body", "firstComment", "subreddit"]
      : channel === "website"
      ? ["slug", "metaDescription", "body"]
      : ["hook", "body", "callToAction"];

  const fieldLabels: Record<string, string> = {
    hook: "Hook override",
    body: "Body override",
    callToAction: "CTA override",
    title: "Reddit title",
    firstComment: "First comment",
    subreddit: "Subreddit",
    slug: "URL slug",
    metaDescription: "Meta description",
    featuredImageRef: "Featured image ref",
  };

  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
        {CHANNEL_LABELS[channel]} — Override
      </h3>
      <div className="space-y-3">
        {fields.map((key) => (
          <div key={key}>
            <label className="block text-xs text-gray-400 mb-1">{fieldLabels[key] ?? key}</label>
            {key === "body" || key === "firstComment" ? (
              <textarea
                value={(ov?.[key] as string) ?? ""}
                onChange={(e) => updateOv(key, e.target.value)}
                rows={3}
                className="input-base resize-none text-xs"
                placeholder="Leave blank to use canonical value"
              />
            ) : (
              <input
                type="text"
                value={(ov?.[key] as string) ?? ""}
                onChange={(e) => updateOv(key, e.target.value)}
                className="input-base text-xs"
                placeholder="Leave blank to use canonical value"
              />
            )}
          </div>
        ))}
        <button
          onClick={() => onSave(overrides[channel])}
          className="px-3 py-1.5 bg-gray-100 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-200 transition-colors"
        >
          Save Override
        </button>
      </div>
    </section>
  );
}

// ── Publish section ────────────────────────────────────────────────────────────

type PublishPlatform = "x" | "linkedin" | "instagram" | "tiktok";

const PUBLISH_PLATFORM_LABELS: Record<PublishPlatform, string> = {
  x: "X (Twitter)",
  linkedin: "LinkedIn",
  instagram: "Instagram",
  tiktok: "TikTok",
};

/** Brief publish support note shown in the platform selector. */
const PUBLISH_PLATFORM_NOTES: Record<PublishPlatform, string | null> = {
  x: null,
  linkedin: null,
  instagram: "Image/video required",
  tiktok: "Audit required",
};

interface PublishSectionProps {
  messageId: string;
  status: string;
  hasRenders: boolean;
  platforms: PublishPlatform[];
  setPlrms: React.Dispatch<React.SetStateAction<PublishPlatform[]>>;
  publishMode: "now" | "schedule";
  setPublishMode: React.Dispatch<React.SetStateAction<"now" | "schedule">>;
  scheduledFor: string;
  setScheduledFor: React.Dispatch<React.SetStateAction<string>>;
  onPublish: () => void;
  isPublishing: boolean;
  error: string;
  jobs: PublishJob[];
}

function PublishSection({
  status,
  hasRenders,
  platforms,
  setPlrms,
  publishMode,
  setPublishMode,
  scheduledFor,
  setScheduledFor,
  onPublish,
  isPublishing,
  error,
  jobs,
}: PublishSectionProps) {
  function togglePlatform(p: PublishPlatform) {
    setPlrms((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);
  }

  const hasActiveJobs = jobs.some((j) => !TERMINAL_STATUSES.has(j.status));

  return (
    <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <h2 className="font-semibold text-gray-900 mb-4">Approve &amp; Publish</h2>

      {!hasRenders && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
          Generate renders first before publishing.
        </p>
      )}

      {/* Platform selector */}
      <div className="mb-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Platforms</p>
        <div className="flex flex-wrap gap-2">
          {(["linkedin", "x", "instagram", "tiktok"] as PublishPlatform[]).map((p) => {
            const note = PUBLISH_PLATFORM_NOTES[p];
            return (
              <button
                key={p}
                onClick={() => togglePlatform(p)}
                className={`flex flex-col items-start px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                  platforms.includes(p)
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"
                }`}
              >
                {PUBLISH_PLATFORM_LABELS[p]}
                {note && (
                  <span className={`text-[10px] mt-0.5 ${platforms.includes(p) ? "text-gray-300" : "text-amber-500"}`}>
                    {note}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Publish mode */}
      <div className="flex gap-2 mb-4">
        {(["now", "schedule"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setPublishMode(m)}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg border transition-all ${
              publishMode === m
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
            }`}
          >
            {m === "now" ? "Publish Now" : "Schedule"}
          </button>
        ))}
      </div>

      {publishMode === "schedule" && (
        <input
          type="datetime-local"
          value={scheduledFor}
          onChange={(e) => setScheduledFor(e.target.value)}
          className="input-base mb-4 text-xs"
        />
      )}

      {error && (
        <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
          {error}
        </p>
      )}

      {(status === "draft" || status === "in_review") && (
        <p className="text-xs text-amber-600 mb-3">
          This campaign will be approved automatically when you publish.
        </p>
      )}

      <button
        onClick={onPublish}
        disabled={isPublishing || !hasRenders || platforms.length === 0 || hasActiveJobs}
        className="w-full py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 text-white font-semibold rounded-xl hover:from-green-700 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm shadow-sm"
      >
        {isPublishing
          ? "Creating jobs…"
          : publishMode === "now"
          ? "Approve & Publish Now →"
          : "Approve & Schedule →"}
      </button>

      {/* Job status */}
      {jobs.length > 0 && (
        <div className="mt-5 space-y-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Publish Jobs</p>
          {jobs.map((job) => (
            <div key={job.id} className="bg-gray-50 border border-gray-100 rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-700 capitalize">{PUBLISH_PLATFORM_LABELS[job.platform as PublishPlatform] ?? job.platform}</span>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${JOB_STATUS_COLORS[job.status] ?? "bg-gray-100 text-gray-500"}`}>
                  {job.status}
                </span>
              </div>
              {job.scheduledFor && (
                <p className="text-[10px] text-gray-400 mb-1.5">
                  Scheduled: {new Date(job.scheduledFor).toLocaleString()}
                </p>
              )}
              {/* Event log */}
              {job.events.length > 0 && (
                <div className="bg-gray-900 rounded-lg p-2.5 space-y-0.5 max-h-32 overflow-y-auto">
                  {job.events.map((ev) => (
                    <div key={ev.id} className="flex gap-2 font-mono text-[10px] leading-4">
                      <span className="text-gray-500 flex-shrink-0">{ev.ts.slice(11, 19)}</span>
                      <span className={
                        ev.level === "error" ? "text-red-400" :
                        ev.level === "warn" ? "text-amber-400" :
                        "text-green-400"
                      }>{ev.message}</span>
                    </div>
                  ))}
                </div>
              )}
              {job.lastError && (
                <p className="text-[10px] text-red-500 mt-1.5">{job.lastError}</p>
              )}
            </div>
          ))}
          {hasActiveJobs && (
            <p className="text-[10px] text-gray-400 text-center animate-pulse">Polling for updates…</p>
          )}
        </div>
      )}
    </section>
  );
}
