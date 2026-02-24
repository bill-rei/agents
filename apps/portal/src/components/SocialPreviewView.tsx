"use client";

import { useState, useEffect, useCallback } from "react";
import type { SocialPostPreview, CropGuidance } from "@/lib/preview/socialPreview";
import type { SocialApprovalState, ChannelApprovalState } from "@/lib/preview/approvalHelper";
import type { SocialPlatform } from "@/lib/preview/platformRules";
import { PLATFORM_RULES, PLATFORMS } from "@/lib/preview/platformRules";

// ── Types coming from the API ─────────────────────────────────────────────────

interface PreviewAPIResponse {
  runId: string;
  previews: SocialPostPreview[];
  approval: SocialApprovalState;
  distributorStep: { id: string; hash: string | null; createdAt: string; status: string } | null;
}

// ── Status colour helpers ─────────────────────────────────────────────────────

function statusColor(s: string): string {
  const map: Record<string, string> = {
    approved: "text-green-700 bg-green-50 border-green-200",
    changes_requested: "text-red-700 bg-red-50 border-red-200",
    approved_all: "text-green-700 bg-green-50 border-green-200",
    needs_changes: "text-red-700 bg-red-50 border-red-200",
    partial: "text-yellow-700 bg-yellow-50 border-yellow-200",
    pending: "text-gray-600 bg-gray-50 border-gray-200",
  };
  return map[s] ?? "text-gray-600 bg-gray-50 border-gray-200";
}

function StatusPill({ status }: { status: string }) {
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-xs font-semibold capitalize ${statusColor(status)}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

// ── Request Changes Modal ─────────────────────────────────────────────────────

function RequestChangesModal({
  runId,
  defaultPlatform,
  onClose,
  onSuccess,
}: {
  runId: string;
  defaultPlatform: SocialPlatform | "all";
  onClose: () => void;
  onSuccess: (updated: SocialApprovalState) => void;
}) {
  const [platform, setPlatform] = useState<SocialPlatform | "all">(defaultPlatform);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    if (!comment.trim()) {
      setError("Comment is required.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/runs/${runId}/approvals/request-changes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, comment }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? "Request failed.");
        return;
      }
      const { approval } = await res.json();
      onSuccess(approval);
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h3 className="mb-4 text-base font-semibold text-gray-900">Request Changes</h3>

        <label className="mb-1 block text-sm font-medium text-gray-700">Scope</label>
        <select
          className="mb-4 w-full rounded border border-gray-300 px-3 py-2 text-sm"
          value={platform}
          onChange={(e) => setPlatform(e.target.value as SocialPlatform | "all")}
        >
          <option value="all">All channels</option>
          {PLATFORMS.map((p) => (
            <option key={p} value={p}>
              {PLATFORM_RULES[p].label}
            </option>
          ))}
        </select>

        <label className="mb-1 block text-sm font-medium text-gray-700">
          Comment <span className="text-red-500">*</span>
        </label>
        <textarea
          rows={4}
          className="mb-1 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
          placeholder="Describe what needs to change…"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
        {error && <p className="mb-2 text-xs text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="rounded bg-yellow-500 px-4 py-2 text-sm font-medium text-white hover:bg-yellow-600 disabled:opacity-50"
          >
            {submitting ? "Sending…" : "Request Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Platform post emulators ───────────────────────────────────────────────────

/** Format text: make #hashtags blue and links underlined. */
function FormattedText({ text, maxChars }: { text: string; maxChars?: number }) {
  const displayText = maxChars && text.length > maxChars ? text.slice(0, maxChars) + "…" : text;
  const parts = displayText.split(/(#\w+|https?:\/\/[^\s)>\]"']+)/g);
  return (
    <span>
      {parts.map((part, i) => {
        if (part.startsWith("#")) {
          return (
            <span key={i} className="text-blue-500 font-medium">
              {part}
            </span>
          );
        }
        if (part.startsWith("http")) {
          return (
            <span key={i} className="text-blue-500 underline break-all">
              {part}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}

function CropOverlay({ guidance, children }: { guidance: CropGuidance; children: React.ReactNode }) {
  return (
    <div className="relative">
      {children}
      {guidance.likelyCropped && (
        <div className="absolute inset-0 border-2 border-dashed border-yellow-400 rounded flex items-end justify-center pb-1">
          <span className="bg-yellow-400/90 text-yellow-900 text-xs px-2 py-0.5 rounded font-medium">
            Crop likely
          </span>
        </div>
      )}
    </div>
  );
}

function MediaPlaceholder({
  media,
  guidance,
  aspectClass,
}: {
  media: SocialPostPreview["media"];
  guidance: CropGuidance;
  aspectClass: string;
}) {
  const inner = media?.url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={media.url} alt={media.alt ?? ""} className="w-full h-full object-cover" />
  ) : (
    <div className="flex h-full items-center justify-center bg-gray-100 text-gray-400 text-xs">
      No media
    </div>
  );

  return (
    <CropOverlay guidance={guidance}>
      <div className={`w-full overflow-hidden rounded ${aspectClass} bg-gray-100`}>{inner}</div>
    </CropOverlay>
  );
}

// X (Twitter) emulator card
function XCard({ preview }: { preview: SocialPostPreview }) {
  const { text, metadata } = preview;
  const over = metadata.charCount > metadata.charLimit;
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 max-w-[500px]">
      {/* Profile row */}
      <div className="flex items-center gap-2 mb-3">
        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold text-sm">
          BL
        </div>
        <div>
          <div className="font-semibold text-sm text-gray-900 leading-none">Best Life App</div>
          <div className="text-xs text-gray-500">@bestlife_app</div>
        </div>
      </div>
      {/* Tweet text */}
      <p className="text-sm text-gray-900 mb-3 whitespace-pre-wrap leading-relaxed">
        <FormattedText text={text} maxChars={over ? metadata.charLimit : undefined} />
      </p>
      {/* Media */}
      {preview.media && (
        <div className="mb-3">
          <MediaPlaceholder
            media={preview.media}
            guidance={metadata.cropGuidance}
            aspectClass="aspect-video"
          />
        </div>
      )}
      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-gray-400 border-t border-gray-100 pt-2">
        <span className={over ? "text-red-600 font-medium" : ""}>
          {metadata.charCount} / {metadata.charLimit}
          {over && " ⚠ Will truncate"}
        </span>
        <div className="flex gap-4">
          <span>♺ Repost</span>
          <span>♡ Like</span>
          <span>↗ Share</span>
        </div>
      </div>
    </div>
  );
}

// LinkedIn emulator card
function LinkedInCard({ preview }: { preview: SocialPostPreview }) {
  const { text, metadata } = preview;
  const truncated = text.length > 200;
  const [expanded, setExpanded] = useState(false);
  const displayText = expanded || !truncated ? text : text.slice(0, 200);
  const over = metadata.charCount > metadata.charLimit;
  return (
    <div className="rounded border border-gray-200 bg-white max-w-[550px]">
      {/* Profile row */}
      <div className="flex items-start gap-3 p-4 pb-2">
        <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-700 to-blue-900 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
          BL
        </div>
        <div>
          <div className="font-semibold text-sm text-gray-900">Best Life App</div>
          <div className="text-xs text-gray-500">Health & Wellness · 1st</div>
          <div className="text-xs text-gray-400">2h · 🌐</div>
        </div>
      </div>
      {/* Text */}
      <div className="px-4 pb-3">
        <p className="text-sm text-gray-900 whitespace-pre-wrap leading-relaxed">
          <FormattedText text={displayText} />
        </p>
        {truncated && !expanded && (
          <button
            onClick={() => setExpanded(true)}
            className="text-xs text-blue-600 font-medium mt-0.5"
          >
            …see more
          </button>
        )}
      </div>
      {/* Media */}
      {preview.media && (
        <div className="mb-1">
          <MediaPlaceholder
            media={preview.media}
            guidance={metadata.cropGuidance}
            aspectClass="aspect-[1.91/1]"
          />
        </div>
      )}
      {/* Engagement bar */}
      <div className="border-t border-gray-100 px-4 py-2 flex gap-4 text-xs text-gray-500">
        <span>👍 Like</span>
        <span>💬 Comment</span>
        <span>🔁 Repost</span>
        <span>➤ Send</span>
      </div>
      {/* Char count */}
      <div className="px-4 py-1 text-xs text-gray-400 border-t border-gray-100">
        <span className={over ? "text-yellow-600 font-medium" : ""}>
          {metadata.charCount} / {metadata.charLimit} chars
          {over && " (soft limit)"}
        </span>
      </div>
    </div>
  );
}

// Instagram emulator card
function InstagramCard({ preview }: { preview: SocialPostPreview }) {
  const { text, metadata } = preview;
  const over = metadata.charCount > metadata.charLimit;
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const truncated = text.length > 125;
  const displayText = captionExpanded || !truncated ? text : text.slice(0, 125);
  return (
    <div className="rounded border border-gray-200 bg-white max-w-[400px]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-pink-500 via-red-500 to-yellow-400 flex items-center justify-center text-white font-bold text-xs">
            BL
          </div>
          <span className="text-sm font-semibold text-gray-900">bestlife_app</span>
        </div>
        <span className="text-gray-400 text-xl">···</span>
      </div>
      {/* Image (4:5 portrait crop guide) */}
      <div className="relative w-full">
        <MediaPlaceholder
          media={preview.media}
          guidance={metadata.cropGuidance}
          aspectClass="aspect-[4/5]"
        />
        {/* Crop guide outline for IG portrait */}
        {!metadata.cropGuidance.likelyCropped && (
          <div className="absolute inset-x-0 top-0 bottom-0 border border-dashed border-gray-300/60 pointer-events-none" />
        )}
      </div>
      {/* Engagement icons */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex gap-4 text-gray-700 text-lg">
          <span>♡</span>
          <span>💬</span>
          <span>↗</span>
        </div>
        <span>🔖</span>
      </div>
      {/* Caption */}
      <div className="px-3 pb-3">
        <p className="text-sm text-gray-900 whitespace-pre-wrap leading-relaxed">
          <span className="font-semibold">bestlife_app </span>
          <FormattedText text={displayText} />
        </p>
        {truncated && !captionExpanded && (
          <button
            onClick={() => setCaptionExpanded(true)}
            className="text-xs text-gray-500 font-medium"
          >
            more
          </button>
        )}
        <div className="text-xs text-gray-400 mt-1">
          <span className={over ? "text-yellow-600 font-medium" : ""}>
            {metadata.charCount} / {metadata.charLimit} chars
            {over && " (soft limit)"}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Per-channel approval controls ─────────────────────────────────────────────

function ChannelApprovalPanel({
  platform,
  channelState,
  runId,
  onApprove,
  onRequestChanges,
}: {
  platform: SocialPlatform;
  channelState: ChannelApprovalState;
  runId: string;
  onApprove: () => void;
  onRequestChanges: () => void;
}) {
  const [approving, setApproving] = useState(false);

  async function handleApprove() {
    setApproving(true);
    try {
      await fetch(`/api/runs/${runId}/approvals/approve-channel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform }),
      });
      onApprove();
    } finally {
      setApproving(false);
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 mt-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-gray-700">
          {PLATFORM_RULES[platform].label} approval
        </span>
        <StatusPill status={channelState.status} />
      </div>

      {channelState.by && (
        <p className="text-xs text-gray-500 mb-3">
          {channelState.status === "approved" ? "Approved" : "Changes requested"} by{" "}
          <strong>{channelState.by}</strong>
          {channelState.at && ` at ${new Date(channelState.at).toLocaleString()}`}
          {channelState.comment && (
            <span className="block mt-1 italic text-gray-600">
              &ldquo;{channelState.comment}&rdquo;
            </span>
          )}
        </p>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleApprove}
          disabled={approving || channelState.status === "approved"}
          className="flex-1 rounded bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-40"
        >
          {approving ? "Approving…" : channelState.status === "approved" ? "✓ Approved" : "Approve"}
        </button>
        <button
          onClick={onRequestChanges}
          className="flex-1 rounded border border-yellow-400 px-3 py-1.5 text-xs font-medium text-yellow-700 hover:bg-yellow-50"
        >
          Request Changes
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SocialPreviewView({ runId }: { runId: string }) {
  const [data, setData] = useState<PreviewAPIResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activePlatform, setActivePlatform] = useState<SocialPlatform>("x");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalPlatform, setModalPlatform] = useState<SocialPlatform | "all">("all");
  const [approveAllLoading, setApproveAllLoading] = useState(false);
  const [approveAllError, setApproveAllError] = useState("");

  const reload = useCallback(async () => {
    const res = await fetch(`/api/runs/${runId}/preview/social`);
    if (res.ok) setData(await res.json());
  }, [runId]);

  useEffect(() => {
    setLoading(true);
    reload().finally(() => setLoading(false));
  }, [reload]);

  async function handleApproveAll() {
    setApproveAllLoading(true);
    setApproveAllError("");
    try {
      const res = await fetch(`/api/runs/${runId}/approvals/approve-all`, { method: "POST" });
      if (!res.ok) {
        const d = await res.json();
        setApproveAllError(d.error ?? "Request failed.");
        return;
      }
      await reload();
    } finally {
      setApproveAllLoading(false);
    }
  }

  function openModal(platform: SocialPlatform | "all" = "all") {
    setModalPlatform(platform);
    setModalOpen(true);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-gray-400">
        Loading previews…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 text-sm text-red-600">Failed to load preview data.</div>
    );
  }

  const { previews, approval, distributorStep } = data;
  const activePreviews = previews.find((p) => p.platform === activePlatform);
  const channelState = approval.channels[activePlatform];

  return (
    <div className="space-y-4">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-gray-800">Social Preview &amp; Approval</span>
          <StatusPill status={approval.overall} />
          {distributorStep ? (
            <span className="text-xs text-gray-400">
              Distributor #{distributorStep.hash?.slice(0, 8) ?? "–"} ·{" "}
              {new Date(distributorStep.createdAt).toLocaleString()}
            </span>
          ) : (
            <span className="rounded bg-yellow-50 border border-yellow-200 px-2 py-0.5 text-xs text-yellow-700">
              No distributor output yet — run the Distributor agent first
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleApproveAll}
            disabled={approveAllLoading || approval.overall === "approved_all"}
            className="rounded bg-green-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-40"
          >
            {approveAllLoading
              ? "Approving…"
              : approval.overall === "approved_all"
              ? "✓ All Approved"
              : "Approve All"}
          </button>
          <button
            onClick={() => openModal("all")}
            className="rounded border border-yellow-400 px-4 py-1.5 text-sm font-medium text-yellow-700 hover:bg-yellow-50"
          >
            Request Changes
          </button>
        </div>
        {approveAllError && (
          <p className="w-full text-xs text-red-600">{approveAllError}</p>
        )}
      </div>

      {/* ── Platform tabs ────────────────────────────────────────────────────── */}
      <div className="flex gap-1 border-b border-gray-200">
        {PLATFORMS.map((p) => {
          const ch = approval.channels[p];
          const isActive = p === activePlatform;
          return (
            <button
              key={p}
              onClick={() => setActivePlatform(p)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm border-b-2 -mb-px ${
                isActive
                  ? "border-blue-600 font-medium text-blue-700"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {PLATFORM_RULES[p].label}
              <StatusPill status={ch.status} />
            </button>
          );
        })}
      </div>

      {/* ── Main panel: emulator + controls ─────────────────────────────────── */}
      <div className="flex gap-6 flex-wrap lg:flex-nowrap">
        {/* Left: emulated post card */}
        <div className="flex-1 min-w-0">
          {!activePreviews || activePreviews.text === "" ? (
            <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-400">
              No {PLATFORM_RULES[activePlatform].label} content in the distributor output.
              <br />
              Run the Distributor agent and ensure it includes a{" "}
              {PLATFORM_RULES[activePlatform].label} section.
            </div>
          ) : activePlatform === "x" ? (
            <XCard preview={activePreviews} />
          ) : activePlatform === "linkedin" ? (
            <LinkedInCard preview={activePreviews} />
          ) : (
            <InstagramCard preview={activePreviews} />
          )}

          {/* Warnings */}
          {activePreviews && activePreviews.metadata.warnings.length > 0 && (
            <div className="mt-3 space-y-1">
              {activePreviews.metadata.warnings.map((w, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 rounded border border-yellow-200 bg-yellow-50 px-3 py-2 text-xs text-yellow-800"
                >
                  <span className="flex-shrink-0">⚠</span>
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: channel approval panel */}
        <div className="w-full lg:w-64 flex-shrink-0">
          <ChannelApprovalPanel
            platform={activePlatform}
            channelState={channelState}
            runId={runId}
            onApprove={reload}
            onRequestChanges={() => openModal(activePlatform)}
          />

          {/* History for this channel */}
          {approval.history.filter((e) => e.platform === activePlatform || e.platform === "all").length >
            0 && (
            <div className="mt-4 rounded border border-gray-100 bg-gray-50 p-3">
              <p className="mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                History
              </p>
              <ul className="space-y-1.5">
                {approval.history
                  .filter((e) => e.platform === activePlatform || e.platform === "all")
                  .map((ev, i) => (
                    <li key={i} className="text-xs text-gray-600">
                      <span className="font-medium">
                        {ev.type === "approve_channel" || ev.type === "approve_all"
                          ? "✓ Approved"
                          : "⚠ Changes requested"}
                      </span>{" "}
                      by {ev.by}
                      {ev.comment && (
                        <span className="block text-gray-500 italic mt-0.5">
                          &ldquo;{ev.comment}&rdquo;
                        </span>
                      )}
                      <span className="block text-gray-400">{new Date(ev.at).toLocaleString()}</span>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* ── Request Changes Modal ────────────────────────────────────────────── */}
      {modalOpen && (
        <RequestChangesModal
          runId={runId}
          defaultPlatform={modalPlatform}
          onClose={() => setModalOpen(false)}
          onSuccess={() => {
            reload();
            setModalOpen(false);
          }}
        />
      )}
    </div>
  );
}
