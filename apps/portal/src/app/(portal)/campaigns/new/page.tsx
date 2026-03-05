"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { UCSBrandMode } from "@/lib/ucs/schema";
import { UCS_BRAND_MODES } from "@/lib/ucs/schema";

export default function NewCampaignPage() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [brandMode, setBrandMode] = useState<UCSBrandMode>("LLIF");
  const [title, setTitle] = useState("");
  const [hook, setHook] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");

  async function handleCreate() {
    if (!title.trim()) { setError("Title is required."); return; }
    if (!hook.trim()) { setError("Hook is required."); return; }
    if (!body.trim()) { setError("Body is required."); return; }
    setError("");

    const res = await fetch("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brandMode,
        title: title.trim(),
        canonical: { hook: hook.trim(), body: body.trim() },
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Failed to create campaign.");
      return;
    }

    const campaign = await res.json();
    startTransition(() => router.push(`/campaigns/${campaign.id}`));
  }

  const BRAND_STYLES: Record<UCSBrandMode, string> = {
    LLIF: "border-indigo-500 bg-indigo-50 text-indigo-700",
    BestLife: "border-emerald-500 bg-emerald-50 text-emerald-700",
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">New Campaign</h1>
        <p className="text-sm text-gray-500 mt-1">
          Choose a brand — this cannot be changed after creation.
        </p>
      </div>

      <div className="space-y-5">
        {/* Brand Mode — immutable after creation */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
            Brand <span className="text-red-400">(immutable)</span>
          </label>
          <div className="flex gap-3">
            {UCS_BRAND_MODES.map((b) => (
              <button
                key={b}
                onClick={() => setBrandMode(b)}
                className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-semibold border-2 transition-all ${
                  brandMode === b ? BRAND_STYLES[b] : "border-gray-200 text-gray-600 hover:border-gray-300 bg-white"
                }`}
              >
                {b}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">
            {brandMode === "LLIF"
              ? "Research-informed · Privacy-forward · Authoritative tone"
              : "Accessible · Warm · Wellness-coach tone"}
          </p>
        </section>

        {/* Title */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <label className="block text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
            Campaign Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Longevity Data Launch — Spring 2026"
            className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </section>

        {/* Initial canonical */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="font-semibold text-gray-900 mb-4">Core Message</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
                Hook / Opening Line
              </label>
              <input
                type="text"
                value={hook}
                onChange={(e) => setHook(e.target.value)}
                placeholder="The attention-grabbing opening — 1–2 sentences"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1.5 uppercase tracking-wide">
                Body
              </label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={5}
                placeholder="Core message — the value you're delivering"
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>
          </div>
        </section>

        {error && (
          <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            {error}
          </p>
        )}

        <button
          onClick={handleCreate}
          disabled={pending || !title.trim() || !hook.trim() || !body.trim()}
          className="w-full py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-semibold rounded-xl hover:from-indigo-700 hover:to-violet-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
        >
          {pending ? "Creating…" : `Create ${brandMode} Campaign →`}
        </button>
      </div>
    </div>
  );
}
