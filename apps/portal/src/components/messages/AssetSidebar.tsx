"use client";

import type { Asset } from "@/lib/types";
import { ASSET_TYPE_LABELS } from "@/lib/types";

const STATUS_STYLES = {
  generated: "bg-green-100 text-green-700",
  edited: "bg-blue-100 text-blue-700",
  regenerating: "bg-yellow-100 text-yellow-600 animate-pulse",
};

interface AssetSidebarProps {
  assets: Asset[];
  activeId: string | null;
  onSelect: (id: string) => void;
}

export default function AssetSidebar({
  assets,
  activeId,
  onSelect,
}: AssetSidebarProps) {
  if (assets.length === 0) {
    return (
      <div className="p-4 text-sm text-gray-400 italic">
        No assets yet — generate a message to see assets here.
      </div>
    );
  }

  return (
    <nav className="space-y-1 p-2">
      {assets.map((asset) => (
        <button
          key={asset.id}
          onClick={() => onSelect(asset.id)}
          className={`w-full text-left px-3 py-2.5 rounded-lg transition-all group ${
            activeId === asset.id
              ? "bg-indigo-50 border border-indigo-200"
              : "hover:bg-gray-50 border border-transparent"
          }`}
        >
          <div className="flex items-center justify-between">
            <span
              className={`text-sm font-medium ${
                activeId === asset.id ? "text-indigo-700" : "text-gray-700"
              }`}
            >
              {ASSET_TYPE_LABELS[asset.type]}
            </span>
            <span
              className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full capitalize ${STATUS_STYLES[asset.status]}`}
            >
              {asset.status}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            {new Date(asset.lastUpdatedAt).toLocaleTimeString(undefined, {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </button>
      ))}
    </nav>
  );
}
