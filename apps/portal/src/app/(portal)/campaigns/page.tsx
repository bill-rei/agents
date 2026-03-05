import Link from "next/link";
import { listUCSMessages } from "@/lib/ucs/storage";

export const dynamic = "force-dynamic";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  in_review: "bg-amber-100 text-amber-700",
  approved: "bg-green-100 text-green-700",
};

const BRAND_COLORS: Record<string, string> = {
  LLIF: "bg-indigo-600",
  BestLife: "bg-emerald-600",
};

export default async function CampaignsPage() {
  const campaigns = await listUCSMessages();

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Campaigns</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Universal Content Schema — write once, render everywhere.
          </p>
        </div>
        <Link
          href="/campaigns/new"
          className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 transition-colors shadow-sm"
        >
          + New Campaign
        </Link>
      </div>

      {campaigns.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-200">
          <p className="text-gray-400 text-sm italic">No campaigns yet.</p>
          <Link
            href="/campaigns/new"
            className="mt-3 inline-block text-indigo-600 text-sm hover:underline"
          >
            Create your first campaign →
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => (
            <Link
              key={c.id}
              href={`/campaigns/${c.id}`}
              className="flex items-center gap-4 bg-white border border-gray-100 rounded-2xl px-5 py-4 hover:shadow-sm transition-shadow group"
            >
              {/* Brand stripe */}
              <div
                className={`w-1.5 self-stretch rounded-full flex-shrink-0 ${BRAND_COLORS[c.brandMode] ?? "bg-gray-300"}`}
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[10px] font-bold text-white px-1.5 py-0.5 rounded-md bg-gray-800">
                    {c.brandMode}
                  </span>
                  <h2 className="font-semibold text-gray-900 text-sm truncate group-hover:text-indigo-600 transition-colors">
                    {c.title}
                  </h2>
                </div>
                <p className="text-xs text-gray-400 truncate">{c.canonical.hook}</p>
              </div>

              <div className="flex items-center gap-3 flex-shrink-0">
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[c.status] ?? "bg-gray-100 text-gray-500"}`}
                >
                  {c.status.replace("_", " ")}
                </span>
                <span className="text-xs text-gray-400">
                  {new Date(c.updatedAt).toLocaleDateString()}
                </span>
                <span className="text-gray-300 group-hover:text-indigo-400 transition-colors">→</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
