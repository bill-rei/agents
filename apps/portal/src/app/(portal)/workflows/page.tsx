import Link from "next/link";
import { listWorkflowTemplates } from "@/lib/mock";
import type { WorkflowCategory, WorkflowBrandScope } from "@/lib/types";
import { WORKFLOW_CATEGORY_LABELS, WORKFLOW_CATEGORY_COLORS } from "@/lib/types";
import WorkflowCard from "@/components/workflows/WorkflowCard";

export const dynamic = "force-dynamic";

const CATEGORY_OPTIONS: { label: string; value: WorkflowCategory | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Social", value: "social" },
  { label: "Blog", value: "blog" },
  { label: "Campaign", value: "campaign" },
  { label: "Website", value: "website" },
  { label: "Custom", value: "custom" },
];

const BRAND_OPTIONS: { label: string; value: WorkflowBrandScope | "all" }[] = [
  { label: "All", value: "all" },
  { label: "LLIF", value: "LLIF" },
  { label: "BestLife", value: "BestLife" },
  { label: "Any", value: "Any" },
];

export default function WorkflowsPage({
  searchParams,
}: {
  searchParams: { category?: string; brand?: string };
}) {
  const all = listWorkflowTemplates();

  const categoryFilter = searchParams.category as WorkflowCategory | "all" | undefined;
  const brandFilter = searchParams.brand as WorkflowBrandScope | "all" | undefined;

  const filtered = all.filter((t) => {
    if (categoryFilter && categoryFilter !== "all" && t.category !== categoryFilter) return false;
    if (brandFilter && brandFilter !== "all" && t.brand !== brandFilter) return false;
    return true;
  });

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Workflow Templates</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Reusable pipeline presets for common publishing patterns.
          </p>
        </div>
        <Link
          href="/workflows/new"
          className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-semibold rounded-xl text-sm hover:from-indigo-700 hover:to-violet-700 transition-all shadow-sm"
        >
          + New Template
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        {/* Category filters */}
        <div className="flex flex-wrap gap-1.5">
          {CATEGORY_OPTIONS.map(({ label, value }) => (
            <Link
              key={value}
              href={
                value === "all"
                  ? brandFilter && brandFilter !== "all"
                    ? `/workflows?brand=${brandFilter}`
                    : "/workflows"
                  : brandFilter && brandFilter !== "all"
                  ? `/workflows?category=${value}&brand=${brandFilter}`
                  : `/workflows?category=${value}`
              }
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                (categoryFilter ?? "all") === value
                  ? "bg-gray-900 text-white border-gray-900"
                  : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>

        {/* Brand filters */}
        <div className="flex gap-1.5 ml-auto">
          {BRAND_OPTIONS.map(({ label, value }) => (
            <Link
              key={value}
              href={
                value === "all"
                  ? categoryFilter && categoryFilter !== "all"
                    ? `/workflows?category=${categoryFilter}`
                    : "/workflows"
                  : categoryFilter && categoryFilter !== "all"
                  ? `/workflows?category=${categoryFilter}&brand=${value}`
                  : `/workflows?brand=${value}`
              }
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                (brandFilter ?? "all") === value
                  ? value === "LLIF"
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : value === "BestLife"
                    ? "bg-emerald-600 text-white border-emerald-600"
                    : "bg-gray-700 text-white border-gray-700"
                  : "bg-white text-gray-500 border-gray-200 hover:border-gray-300"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      {/* Templates grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-gray-200">
          <p className="text-gray-400 mb-3">No templates match the current filter.</p>
          <Link href="/workflows/new" className="text-indigo-600 text-sm hover:underline">
            Create your first template →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((t) => (
            <WorkflowCard key={t.id} template={t} />
          ))}
        </div>
      )}
    </div>
  );
}
