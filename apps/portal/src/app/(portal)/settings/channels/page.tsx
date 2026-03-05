"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import type { UCSBrandMode } from "@/lib/ucs/schema";

interface SafeConnection {
  id: string;
  brandMode: string;
  platform: string;
  displayName: string;
  expiresAt: string | null;
  connectedAt: string;
  expired: boolean;
}

type Platform = "x" | "linkedin" | "instagram" | "tiktok";

const PLATFORM_LABELS: Record<Platform, string> = {
  x: "X (Twitter)",
  linkedin: "LinkedIn",
  instagram: "Instagram",
  tiktok: "TikTok",
};
const PLATFORM_ICONS: Record<Platform, string> = { x: "𝕏", linkedin: "in", instagram: "IG", tiktok: "TT" };

/** Notes shown under unconnected cards to set expectations. */
const PLATFORM_NOTES: Record<Platform, string | null> = {
  x: null,
  linkedin: null,
  instagram: "Requires image/video — text-only posts are not supported by the Instagram API.",
  tiktok: "Video publishing requires TikTok app audit approval. Connect now to prepare.",
};

const BRAND_COLORS: Record<UCSBrandMode, string> = {
  LLIF: "text-indigo-700 bg-indigo-50 border-indigo-200",
  BestLife: "text-emerald-700 bg-emerald-50 border-emerald-200",
};

export default function ChannelsSettingsPage() {
  const searchParams = useSearchParams();
  const [brand, setBrand] = useState<UCSBrandMode>("LLIF");
  const [connections, setConnections] = useState<SafeConnection[]>([]);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; msg: string }>>({});
  const [loading, setLoading] = useState(false);
  const [banner, setBanner] = useState<{ type: "success" | "error"; msg: string } | null>(null);

  const fetchConnections = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/connect/connections?brandMode=${brand}`);
    if (res.ok) setConnections(await res.json());
    setLoading(false);
  }, [brand]);

  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  // Show banner from OAuth redirect
  useEffect(() => {
    const connected = searchParams.get("connected");
    const error = searchParams.get("error");
    const brandParam = searchParams.get("brand") as UCSBrandMode | null;
    if (connected) {
      if (brandParam) setBrand(brandParam);
      setBanner({ type: "success", msg: `${PLATFORM_LABELS[connected as Platform] ?? connected} connected successfully!` });
    } else if (error) {
      setBanner({ type: "error", msg: `OAuth error: ${error.replace(/_/g, " ")}` });
    }
  }, [searchParams]);

  async function handleDisconnect(id: string) {
    if (!confirm("Disconnect this account? Active scheduled jobs may fail.")) return;
    await fetch("/api/connect/connections", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    fetchConnections();
  }

  async function handleTest(conn: SafeConnection) {
    setTestResults((p) => ({ ...p, [conn.id]: { ok: false, msg: "Testing…" } }));
    const res = await fetch("/api/connect/connections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: conn.id }),
    });
    const data = await res.json() as { ok: boolean; displayName?: string; error?: string };
    setTestResults((p) => ({
      ...p,
      [conn.id]: {
        ok: data.ok,
        msg: data.ok ? `✓ Connected as ${data.displayName ?? conn.displayName}` : `✗ ${data.error}`,
      },
    }));
  }

  const platforms: Platform[] = ["x", "linkedin", "instagram", "tiktok"];

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Connected Channels</h1>
        <p className="text-sm text-gray-500 mt-1">
          Connect social accounts per brand. Connections are brand-isolated — an LLIF account cannot publish BestLife content.
        </p>
      </div>

      {banner && (
        <div
          className={`mb-5 rounded-xl px-4 py-3 text-sm border ${
            banner.type === "success"
              ? "bg-green-50 border-green-200 text-green-800"
              : "bg-red-50 border-red-200 text-red-700"
          }`}
        >
          {banner.msg}
          <button onClick={() => setBanner(null)} className="ml-3 text-xs opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {/* Brand selector */}
      <div className="flex gap-3 mb-6">
        {(["LLIF", "BestLife"] as UCSBrandMode[]).map((b) => (
          <button
            key={b}
            onClick={() => setBrand(b)}
            className={`px-5 py-2 rounded-xl text-sm font-semibold border-2 transition-all ${
              brand === b ? BRAND_COLORS[b] : "border-gray-200 text-gray-500 hover:border-gray-300"
            }`}
          >
            {b}
          </button>
        ))}
      </div>

      {/* Platform cards */}
      <div className="space-y-4">
        {platforms.map((platform) => {
          const conn = connections.find((c) => c.platform === platform);
          const test = testResults[conn?.id ?? ""];
          const note = PLATFORM_NOTES[platform];

          return (
            <div key={platform} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gray-900 text-white flex items-center justify-center font-bold text-sm">
                    {PLATFORM_ICONS[platform]}
                  </div>
                  <div>
                    <h2 className="font-semibold text-gray-900">{PLATFORM_LABELS[platform]}</h2>
                    {conn ? (
                      <p className="text-xs text-gray-500">
                        {conn.displayName}
                        {conn.expired && (
                          <span className="ml-2 text-red-500 font-medium">· Token expired</span>
                        )}
                        {!conn.expired && conn.expiresAt && (
                          <span className="ml-2 text-gray-400">
                            · expires {new Date(conn.expiresAt).toLocaleDateString()}
                          </span>
                        )}
                      </p>
                    ) : (
                      <p className="text-xs text-gray-400">Not connected</p>
                    )}
                    {note && !conn && (
                      <p className="text-[11px] text-amber-600 mt-0.5 max-w-xs">{note}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {conn ? (
                    <>
                      <button
                        onClick={() => handleTest(conn)}
                        className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                      >
                        Test
                      </button>
                      <a
                        href={`/api/connect/${platform}/start?brand=${brand}`}
                        className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                      >
                        Reconnect
                      </a>
                      <button
                        onClick={() => handleDisconnect(conn.id)}
                        className="text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                      >
                        Disconnect
                      </button>
                    </>
                  ) : (
                    <a
                      href={`/api/connect/${platform}/start?brand=${brand}`}
                      className="text-xs px-4 py-2 rounded-xl bg-gray-900 text-white font-semibold hover:bg-gray-700 transition-colors"
                    >
                      Connect {brand} →
                    </a>
                  )}
                </div>
              </div>

              {test && (
                <p className={`mt-3 text-xs px-3 py-2 rounded-lg ${test.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
                  {test.msg}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-8 bg-gray-50 rounded-xl border border-gray-200 p-4 text-xs text-gray-500 space-y-1">
        <p className="font-semibold text-gray-600">Required environment variables</p>
        <ul className="space-y-0.5 font-mono">
          <li>X_CLIENT_ID · X_CLIENT_SECRET · X_REDIRECT_URI</li>
          <li>LINKEDIN_CLIENT_ID · LINKEDIN_CLIENT_SECRET · LINKEDIN_REDIRECT_URI</li>
          <li>INSTAGRAM_CLIENT_ID · INSTAGRAM_CLIENT_SECRET · INSTAGRAM_REDIRECT_URI</li>
          <li>TIKTOK_CLIENT_KEY · TIKTOK_CLIENT_SECRET · TIKTOK_REDIRECT_URI</li>
          <li>TOKEN_ENCRYPTION_KEY (32-byte hex: openssl rand -hex 32)</li>
        </ul>
        <p className="text-gray-400 pt-1">Brand-specific prefix: LLIF_INSTAGRAM_CLIENT_ID, BESTLIFE_X_CLIENT_ID, etc.</p>
      </div>
    </div>
  );
}
