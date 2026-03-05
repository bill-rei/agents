"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import type { Message, MessageStatus } from "@/lib/types";
import { CHANNEL_LABELS } from "@/lib/types";
import { useMockRole } from "@/components/MockRoleProvider";

const STATUS_STYLES: Record<MessageStatus, string> = {
  draft: "bg-gray-100 text-gray-600",
  generating: "bg-blue-100 text-blue-700",
  in_review: "bg-yellow-100 text-yellow-700",
  scheduled: "bg-purple-100 text-purple-700",
  published: "bg-green-100 text-green-700",
  needs_edits: "bg-red-100 text-red-700",
};

const STATUS_LABELS: Record<MessageStatus, string> = {
  draft: "Draft",
  generating: "Generating",
  in_review: "In Review",
  scheduled: "Scheduled",
  published: "Published",
  needs_edits: "Needs Edits",
};

export default function ReviewPage() {
  const { role, name: currentUserName } = useMockRole();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionMap, setActionMap] = useState<Record<string, boolean>>({});
  const [noteMap, setNoteMap] = useState<Record<string, string>>({});
  const [showNoteFor, setShowNoteFor] = useState<string | null>(null);
  const [feedbackMap, setFeedbackMap] = useState<Record<string, string>>({});

  const canApprove = role === "admin" || role === "reviewer";

  async function loadMessages() {
    const res = await fetch("/api/messages");
    if (res.ok) {
      const { messages: all } = await res.json() as { messages: Message[] };
      setMessages(all.filter((m) => m.status === "in_review"));
    }
    setLoading(false);
  }

  useEffect(() => { loadMessages(); }, []);

  async function handleApprove(id: string) {
    setActionMap((m) => ({ ...m, [id]: true }));
    const res = await fetch(`/api/messages/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve", approverRole: role, approverName: currentUserName }),
    });
    if (res.ok) {
      const { action, message: msg } = await res.json() as { action: string; message: Message };
      setFeedbackMap((m) => ({
        ...m,
        [id]: action === "published" ? "Published!" : `Scheduled for ${msg.scheduledFor ? new Date(msg.scheduledFor).toLocaleString() : "set time"}.`,
      }));
      setMessages((prev) => prev.filter((m) => m.id !== id));
    } else {
      const { error } = await res.json().catch(() => ({ error: "Failed" })) as { error: string };
      setFeedbackMap((m) => ({ ...m, [id]: `Error: ${error}` }));
    }
    setActionMap((m) => ({ ...m, [id]: false }));
  }

  async function handleRequestEdits(id: string) {
    const note = noteMap[id] ?? "";
    setActionMap((m) => ({ ...m, [id]: true }));
    const res = await fetch(`/api/messages/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "request_edits", note }),
    });
    if (res.ok) {
      setMessages((prev) => prev.filter((m) => m.id !== id));
      setShowNoteFor(null);
    }
    setActionMap((m) => ({ ...m, [id]: false }));
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6 text-gray-400">Loading…</div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Review Queue</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {messages.length} message{messages.length !== 1 ? "s" : ""} awaiting review
          {!canApprove && (
            <span className="ml-2 text-yellow-600">
              · Your role ({role}) cannot approve — switch to Admin or Reviewer to approve
            </span>
          )}
        </p>
      </div>

      {messages.length === 0 && Object.keys(feedbackMap).length === 0 && (
        <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-200">
          <p className="text-gray-400 mb-3">No messages pending review.</p>
          <Link href="/messages" className="text-indigo-600 text-sm hover:underline">
            View all messages →
          </Link>
        </div>
      )}

      {/* Feedback banners for recently processed items */}
      {Object.entries(feedbackMap).map(([id, msg]) => (
        <div key={id} className="mb-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">
          {msg}
        </div>
      ))}

      <div className="space-y-4">
        {messages.map((m) => (
          <div key={m.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            {/* Message info */}
            <div className="flex items-start justify-between gap-2 mb-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    {m.brand}
                  </span>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[m.status]}`}>
                    {STATUS_LABELS[m.status]}
                  </span>
                </div>
                <Link
                  href={`/messages/${m.id}`}
                  className="font-semibold text-gray-900 hover:text-indigo-600 transition-colors"
                >
                  {m.title}
                </Link>
                <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{m.idea}</p>
              </div>
            </div>

            {/* Metadata */}
            <div className="flex flex-wrap gap-2 text-xs text-gray-400 mb-4">
              <span>By {m.createdBy}</span>
              <span>·</span>
              <span>{m.channels.map((c) => CHANNEL_LABELS[c]).join(", ")}</span>
              {m.publishMode === "schedule" && m.scheduledFor && (
                <>
                  <span>·</span>
                  <span>Scheduled: {new Date(m.scheduledFor).toLocaleString()}</span>
                </>
              )}
              {m.publishMode === "now" && (
                <>
                  <span>·</span>
                  <span className="text-orange-500 font-medium">Publish immediately on approval</span>
                </>
              )}
            </div>

            {/* "What will happen" governance note */}
            {canApprove && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-800 mb-4">
                {m.publishMode === "now"
                  ? `Approving will publish now to: ${m.channels.map((c) => CHANNEL_LABELS[c]).join(", ")}`
                  : m.publishMode === "schedule"
                  ? `Approving will schedule for: ${m.scheduledFor ? new Date(m.scheduledFor).toLocaleString() : "the specified time"}`
                  : "Approving will save as approved draft."}
              </div>
            )}

            {/* Action buttons */}
            {canApprove ? (
              <div className="flex gap-2 items-start">
                <button
                  onClick={() => handleApprove(m.id)}
                  disabled={actionMap[m.id]}
                  className="flex-1 py-2 bg-green-600 text-white font-semibold rounded-xl text-sm hover:bg-green-700 disabled:opacity-50 transition-all"
                >
                  {actionMap[m.id] ? "Processing…" : (m.publishMode === "schedule" ? "Approve & Schedule" : "Approve & Publish")}
                </button>

                <div className="relative">
                  <button
                    onClick={() =>
                      setShowNoteFor(showNoteFor === m.id ? null : m.id)
                    }
                    disabled={actionMap[m.id]}
                    className="py-2 px-4 border border-red-200 text-red-600 bg-red-50 rounded-xl text-sm hover:bg-red-100 disabled:opacity-50 transition-all"
                  >
                    Request Edits
                  </button>

                  {showNoteFor === m.id && (
                    <div className="absolute bottom-full right-0 mb-1 bg-white rounded-xl shadow-lg border border-gray-200 p-3 w-64 z-10">
                      <textarea
                        value={noteMap[m.id] ?? ""}
                        onChange={(e) =>
                          setNoteMap((prev) => ({ ...prev, [m.id]: e.target.value }))
                        }
                        placeholder="Describe what needs to change…"
                        className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-red-400"
                        rows={3}
                      />
                      <div className="flex justify-end gap-2 mt-2">
                        <button
                          onClick={() => setShowNoteFor(null)}
                          className="text-xs text-gray-500"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleRequestEdits(m.id)}
                          className="text-xs bg-red-500 text-white px-3 py-1 rounded-lg hover:bg-red-600"
                        >
                          Send
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <Link
                  href={`/messages/${m.id}`}
                  className="py-2 px-4 border border-gray-200 text-gray-600 rounded-xl text-sm hover:bg-gray-50 transition-all"
                >
                  View
                </Link>
              </div>
            ) : (
              <div className="flex gap-2">
                <Link
                  href={`/messages/${m.id}`}
                  className="flex-1 py-2 text-center border border-gray-200 text-gray-600 rounded-xl text-sm hover:bg-gray-50 transition-all"
                >
                  View Message
                </Link>
                <p className="text-xs text-gray-400 self-center">
                  Switch to Admin/Reviewer to approve
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
