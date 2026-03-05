"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { Message, Asset, MessageStatus } from "@/lib/types";
import { CHANNEL_LABELS } from "@/lib/types";
import AssetSidebar from "@/components/messages/AssetSidebar";
import AssetEditor from "@/components/messages/AssetEditor";
import AgentActivityFeed from "@/components/messages/AgentActivityFeed";
import { useMockRole } from "@/components/MockRoleProvider";

const STATUS_LABELS: Record<MessageStatus, string> = {
  draft: "Draft",
  generating: "Generating…",
  in_review: "In Review",
  scheduled: "Scheduled",
  published: "Published",
  needs_edits: "Needs Edits",
};

const STATUS_STYLES: Record<MessageStatus, string> = {
  draft: "bg-gray-100 text-gray-600",
  generating: "bg-blue-100 text-blue-700 animate-pulse",
  in_review: "bg-yellow-100 text-yellow-700",
  scheduled: "bg-purple-100 text-purple-700",
  published: "bg-green-100 text-green-700",
  needs_edits: "bg-red-100 text-red-700",
};

const BRAND_GRADIENT = {
  LLIF: "from-indigo-50 to-violet-50 border-indigo-200",
  BestLife: "from-emerald-50 to-teal-50 border-emerald-200",
};

export default function MessageDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const { role, name: currentUserName } = useMockRole();

  const [message, setMessage] = useState<Message | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeAssetId, setActiveAssetId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [editNote, setEditNote] = useState("");
  const [showEditNote, setShowEditNote] = useState(false);
  const [error, setError] = useState("");

  const fetchMessage = useCallback(async () => {
    const res = await fetch(`/api/messages/${params.id}`);
    if (!res.ok) { router.push("/messages"); return; }
    const { message: msg } = await res.json() as { message: Message };
    setMessage(msg);
    if (!activeAssetId && msg.assets.length > 0) {
      setActiveAssetId(msg.assets[0].id);
    }
  }, [params.id, activeAssetId, router]);

  useEffect(() => {
    fetchMessage().finally(() => setLoading(false));
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-simulate generation for fresh draft messages with no asset content
  useEffect(() => {
    if (!message) return;
    const hasContent = message.assets.some((a) => a.contentText);
    if (message.status === "draft" && !hasContent && message.assets.length > 0 && !generating) {
      handleGenerate();
    }
  }, [message?.id]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Poll for activity updates while generating
  useEffect(() => {
    if (!generating) return;
    const interval = setInterval(fetchMessage, 1500);
    return () => clearInterval(interval);
  }, [generating, fetchMessage]);

  async function patch(body: Record<string, unknown>): Promise<Message | null> {
    const res = await fetch(`/api/messages/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const { error: e } = await res.json().catch(() => ({ error: "Unknown error" })) as { error: string };
      setError(e);
      return null;
    }
    const data = await res.json() as { message?: Message };
    return data.message ?? null;
  }

  async function handleGenerate() {
    setGenerating(true);
    setError("");
    const msg = await patch({ action: "generate" });
    if (msg) setMessage(msg);
    setGenerating(false);
  }

  async function handleSaveAsset(assetId: string, content: string) {
    const msg = await patch({ action: "save_asset", assetId, content });
    if (msg) setMessage(msg);
  }

  async function handleRegenerateAsset(assetId: string) {
    const msg = await patch({ action: "regenerate_asset", assetId });
    if (msg) setMessage(msg);
  }

  async function handleSubmitForReview() {
    setActionPending(true);
    const msg = await patch({ action: "submit_review" });
    if (msg) setMessage(msg);
    setActionPending(false);
  }

  async function handleApprove() {
    setActionPending(true);
    const res = await fetch(`/api/messages/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "approve",
        approverRole: role,
        approverName: currentUserName,
      }),
    });
    if (res.ok) {
      const { message: msg } = await res.json() as { message: Message };
      setMessage(msg);
    } else {
      const { error: e } = await res.json().catch(() => ({ error: "Failed" })) as { error: string };
      setError(e);
    }
    setActionPending(false);
  }

  async function handleRequestEdits() {
    setActionPending(true);
    const msg = await patch({ action: "request_edits", note: editNote });
    if (msg) { setMessage(msg); setShowEditNote(false); setEditNote(""); }
    setActionPending(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-64px)] text-gray-400">
        Loading…
      </div>
    );
  }

  if (!message) return null;

  const activeAsset = message.assets.find((a) => a.id === activeAssetId) ?? null;
  const isRunning = generating || message.status === "generating";
  const canApprove = role === "admin" || role === "reviewer";
  const canSubmit = message.status === "draft" || message.status === "needs_edits";

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col">
      {/* Top action bar */}
      <div
        className={`bg-gradient-to-r ${BRAND_GRADIENT[message.brand]} border-b px-5 py-3 flex items-center gap-3 flex-shrink-0`}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              {message.brand}
            </span>
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[message.status]}`}
            >
              {STATUS_LABELS[message.status]}
            </span>
            {message.channels.map((ch) => (
              <span
                key={ch}
                className="text-xs px-2 py-0.5 bg-white/60 text-gray-600 rounded-full border border-gray-200"
              >
                {CHANNEL_LABELS[ch]}
              </span>
            ))}
          </div>
          <h1 className="font-semibold text-gray-900 text-sm mt-0.5 truncate">
            {message.title}
          </h1>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {error && (
            <span className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded-lg">
              {error}
            </span>
          )}

          {/* Generate */}
          {message.assets.length > 0 && !isRunning && (
            <button
              onClick={handleGenerate}
              className="px-3 py-1.5 text-xs border border-gray-300 bg-white rounded-lg text-gray-600 hover:bg-gray-50 transition-all"
            >
              ↺ Regenerate All
            </button>
          )}

          {/* Submit for review */}
          {canSubmit && (
            <button
              onClick={handleSubmitForReview}
              disabled={actionPending}
              className="px-4 py-1.5 text-sm font-medium bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 disabled:opacity-50 transition-all"
            >
              {actionPending ? "…" : "Submit for Review"}
            </button>
          )}

          {/* Approve — reviewers + admins when message is in_review */}
          {canApprove && message.status === "in_review" && (
            <>
              <div className="relative">
                <button
                  onClick={() => setShowEditNote(!showEditNote)}
                  disabled={actionPending}
                  className="px-3 py-1.5 text-sm border border-red-200 text-red-600 bg-red-50 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-all"
                >
                  Request Edits
                </button>
                {showEditNote && (
                  <div className="absolute top-full right-0 mt-1 bg-white rounded-xl shadow-lg border border-gray-200 p-3 w-64 z-10">
                    <textarea
                      value={editNote}
                      onChange={(e) => setEditNote(e.target.value)}
                      placeholder="Describe what needs to change…"
                      className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-red-400"
                      rows={3}
                    />
                    <div className="flex justify-end gap-2 mt-2">
                      <button onClick={() => setShowEditNote(false)} className="text-xs text-gray-500">Cancel</button>
                      <button
                        onClick={handleRequestEdits}
                        className="text-xs bg-red-500 text-white px-3 py-1 rounded-lg hover:bg-red-600"
                      >
                        Send
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="relative group">
                <button
                  onClick={handleApprove}
                  disabled={actionPending}
                  className="px-4 py-1.5 text-sm font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-all"
                >
                  {actionPending ? "…" : "Approve & " + (message.publishMode === "schedule" ? "Schedule" : "Publish")}
                </button>
                {/* Governance tooltip */}
                <div className="absolute bottom-full right-0 mb-1 w-64 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                  {message.publishMode === "now"
                    ? `Approving will publish immediately to: ${message.channels.map((c) => CHANNEL_LABELS[c]).join(", ")}`
                    : `Approving will schedule for: ${message.scheduledFor ? new Date(message.scheduledFor).toLocaleString() : "set time"}`}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 3-column body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Assets list */}
        <div className="w-52 flex-shrink-0 border-r border-gray-100 bg-white overflow-y-auto">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Assets ({message.assets.length})
            </h2>
          </div>
          <AssetSidebar
            assets={message.assets}
            activeId={activeAssetId}
            onSelect={setActiveAssetId}
          />
        </div>

        {/* Middle: Asset editor */}
        <div className="flex-1 min-w-0 overflow-hidden bg-gray-50">
          {activeAsset ? (
            <AssetEditor
              asset={activeAsset}
              message={message}
              onSave={handleSaveAsset}
              onRegenerate={handleRegenerateAsset}
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-gray-400">
              <p className="text-sm">
                {message.assets.length === 0
                  ? "No assets yet."
                  : "Select an asset to edit."}
              </p>
              {message.assets.length === 0 && (
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm hover:bg-indigo-700 disabled:opacity-50"
                >
                  {generating ? "Generating…" : "Generate Assets"}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right: Agent activity (ALWAYS VISIBLE) */}
        <div className="w-80 flex-shrink-0 border-l border-gray-900 overflow-hidden">
          <AgentActivityFeed
            pipeline={message.pipeline}
            activity={message.activity}
            isRunning={isRunning}
          />
        </div>
      </div>
    </div>
  );
}
