"use client";

import Link from "next/link";
import type { Message, MessageStatus } from "@/lib/types";
import { CHANNEL_LABELS } from "@/lib/types";

const STATUS_STYLES: Record<MessageStatus, string> = {
  draft: "bg-gray-100 text-gray-600",
  generating: "bg-blue-100 text-blue-700 animate-pulse",
  in_review: "bg-yellow-100 text-yellow-700",
  scheduled: "bg-purple-100 text-purple-700",
  published: "bg-green-100 text-green-700",
  needs_edits: "bg-red-100 text-red-700",
};

const STATUS_LABELS: Record<MessageStatus, string> = {
  draft: "Draft",
  generating: "Generating…",
  in_review: "In Review",
  scheduled: "Scheduled",
  published: "Published",
  needs_edits: "Needs Edits",
};

const BRAND_STYLES = {
  LLIF: "border-l-4 border-indigo-500",
  BestLife: "border-l-4 border-emerald-500",
};

export default function MessageCard({ msg }: { msg: Message }) {
  const relativeTime = formatRelative(msg.createdAt);

  return (
    <Link href={`/messages/${msg.id}`} className="block group">
      <div
        className={`bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow p-4 ${BRAND_STYLES[msg.brand]}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                {msg.brand}
              </span>
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[msg.status]}`}
              >
                {STATUS_LABELS[msg.status]}
              </span>
            </div>
            <h3 className="font-semibold text-gray-900 group-hover:text-indigo-600 transition-colors truncate">
              {msg.title}
            </h3>
            <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">
              {msg.idea}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-3 text-xs text-gray-400">
          <span>{relativeTime}</span>
          <span>·</span>
          <span>{msg.createdBy}</span>
          {msg.channels.length > 0 && (
            <>
              <span>·</span>
              <span>{msg.channels.map((c) => CHANNEL_LABELS[c]).join(", ")}</span>
            </>
          )}
          {msg.scheduledFor && msg.status === "scheduled" && (
            <>
              <span>·</span>
              <span>
                {new Date(msg.scheduledFor).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
