import Link from "next/link";
import { listMessages } from "@/lib/mock";
import MessageCard from "@/components/messages/MessageCard";
import type { MessageStatus, Brand } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUS_FILTER_OPTIONS: { label: string; value: MessageStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Draft", value: "draft" },
  { label: "In Review", value: "in_review" },
  { label: "Scheduled", value: "scheduled" },
  { label: "Published", value: "published" },
  { label: "Needs Edits", value: "needs_edits" },
];

export default function MessagesPage({
  searchParams,
}: {
  searchParams: { status?: string; brand?: string };
}) {
  const all = listMessages();
  const statusFilter = searchParams.status as MessageStatus | "all" | undefined;
  const brandFilter = searchParams.brand as Brand | undefined;

  const filtered = all.filter((m) => {
    if (statusFilter && statusFilter !== "all" && m.status !== statusFilter) return false;
    if (brandFilter && m.brand !== brandFilter) return false;
    return true;
  });

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Messages</h1>
          <p className="text-sm text-gray-500 mt-0.5">{all.length} total</p>
        </div>
        <Link
          href="/create"
          className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-semibold rounded-xl text-sm hover:from-indigo-700 hover:to-violet-700 transition-all shadow-sm"
        >
          + New Message
        </Link>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-2 mb-6">
        {STATUS_FILTER_OPTIONS.map(({ label, value }) => (
          <Link
            key={value}
            href={value === "all" ? "/messages" : `/messages?status=${value}`}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${
              (statusFilter ?? "all") === value
                ? "bg-indigo-600 text-white border-indigo-600"
                : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
            }`}
          >
            {label}
          </Link>
        ))}

        <div className="flex gap-1 ml-auto">
          {(["LLIF", "BestLife"] as Brand[]).map((b) => (
            <Link
              key={b}
              href={brandFilter === b ? "/messages" : `/messages?brand=${b}`}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                brandFilter === b
                  ? b === "LLIF"
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-emerald-600 text-white border-emerald-600"
                  : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
              }`}
            >
              {b}
            </Link>
          ))}
        </div>
      </div>

      {/* Message list */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-200">
          <p className="text-gray-400 mb-3">No messages match the current filter.</p>
          <Link href="/create" className="text-indigo-600 text-sm hover:underline">
            Create your first message →
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((m) => (
            <MessageCard key={m.id} msg={m} />
          ))}
        </div>
      )}
    </div>
  );
}
