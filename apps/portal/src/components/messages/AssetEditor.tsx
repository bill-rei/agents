"use client";

import { useState, useEffect } from "react";
import type { Asset, Message } from "@/lib/types";
import { ASSET_TYPE_LABELS } from "@/lib/types";

interface AssetEditorProps {
  asset: Asset;
  message: Message;
  onSave: (assetId: string, content: string) => Promise<void>;
  onRegenerate: (assetId: string) => Promise<void>;
}

export default function AssetEditor({
  asset,
  message,
  onSave,
  onRegenerate,
}: AssetEditorProps) {
  const [text, setText] = useState(asset.contentText ?? "");
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [saved, setSaved] = useState(false);

  // Sync if asset changes (e.g., after regenerate)
  useEffect(() => {
    setText(asset.contentText ?? "");
    setSaved(false);
  }, [asset.id, asset.contentText]);

  const isVisual = asset.type === "visual";
  const charLimit = asset.type === "x_post" ? 280 : asset.type === "linkedin_post" ? 3000 : undefined;

  async function handleSave() {
    setSaving(true);
    await onSave(asset.id, text);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleRegenerate() {
    setRegenerating(true);
    await onRegenerate(asset.id);
    setRegenerating(false);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Asset header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-white">
        <div>
          <h3 className="font-semibold text-gray-900">
            {ASSET_TYPE_LABELS[asset.type]}
          </h3>
          <p className="text-xs text-gray-400">
            {message.brand} · Last updated{" "}
            {new Date(asset.lastUpdatedAt).toLocaleTimeString(undefined, {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleRegenerate}
            disabled={regenerating || asset.status === "regenerating"}
            className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-all"
          >
            {regenerating ? "Regenerating…" : "↺ Regenerate"}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || isVisual}
            className={`px-4 py-1.5 text-sm rounded-lg font-medium transition-all ${
              saved
                ? "bg-green-500 text-white"
                : "bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
            }`}
          >
            {saving ? "Saving…" : saved ? "Saved ✓" : "Save"}
          </button>
        </div>
      </div>

      {/* Editor area */}
      <div className="flex-1 p-5 overflow-auto">
        {isVisual ? (
          <div className="h-full flex flex-col items-center justify-center bg-gray-50 rounded-xl border-2 border-dashed border-gray-200 text-center p-8">
            <div className="text-4xl mb-3">🎨</div>
            <p className="text-gray-500 font-medium">Visual Asset</p>
            <p className="text-sm text-gray-400 mt-1">
              {asset.contentUrl
                ? "Preview available"
                : "Visual will appear here once generated."}
            </p>
            {asset.contentUrl && (
              <a
                href={asset.contentUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-4 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-lg text-sm hover:bg-indigo-100 transition-all"
              >
                Open Visual →
              </a>
            )}
          </div>
        ) : (
          <div className="h-full flex flex-col">
            <textarea
              value={text}
              onChange={(e) => { setText(e.target.value); setSaved(false); }}
              className="flex-1 w-full resize-none border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 font-sans leading-relaxed"
              placeholder="Generated content will appear here…"
            />
            {charLimit && (
              <div className="flex justify-end mt-1.5">
                <span
                  className={`text-xs ${
                    text.length > charLimit
                      ? "text-red-500 font-medium"
                      : "text-gray-400"
                  }`}
                >
                  {text.length} / {charLimit}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
