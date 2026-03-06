"use client";

import { useState } from "react";
import { useBrand } from "@/lib/useBrand";
import { useMockRole } from "@/components/MockRoleProvider";

/**
 * Brand Settings screen — admin only.
 *
 * Shows the resolved BrandConfig as a read-only JSON view and provides
 * a "Copy JSON" button. Intended for debugging and verifying the active
 * brand configuration without touching any files.
 */
export default function BrandSettingsPage() {
  const { brand, loading } = useBrand();
  const { role } = useMockRole();
  const [copied, setCopied] = useState(false);

  // Restrict to admin
  if (role !== "admin") {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-sm text-red-700">
          Access denied. Brand Settings is only available to admins.
        </div>
      </div>
    );
  }

  async function copyJson() {
    if (!brand) return;
    await navigator.clipboard.writeText(JSON.stringify(brand, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const configJson = brand ? JSON.stringify(brand, null, 2) : null;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Brand Settings</h1>
          <p className="text-sm text-gray-500 mt-1">
            Read-only view of the resolved brand configuration. Edit{" "}
            <code className="text-xs bg-gray-100 rounded px-1">
              src/config/brand/registry.ts
            </code>{" "}
            to change values.
          </p>
        </div>
        <button
          onClick={copyJson}
          disabled={!brand}
          className="shrink-0 text-xs font-medium px-4 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40"
        >
          {copied ? "Copied!" : "Copy JSON"}
        </button>
      </div>

      {loading && (
        <div className="bg-white border rounded-xl p-6 text-sm text-gray-400">
          Loading brand configuration…
        </div>
      )}

      {!loading && !brand && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-sm text-red-700">
          No brand configuration found. Check{" "}
          <code className="text-xs bg-red-100 rounded px-1">DEFAULT_BRAND_KEY</code> in your{" "}
          <code className="text-xs bg-red-100 rounded px-1">.env</code> file.
        </div>
      )}

      {brand && (
        <>
          {/* Quick-reference cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
            <InfoCard label="Brand Key" value={brand.brandKey} mono />
            <InfoCard label="Display Name" value={brand.displayName} />
            <InfoCard label="Legal Name" value={brand.legalName} />
            <InfoCard label="Primary Domain" value={brand.primaryDomain} mono />
            <InfoCard label="Support Email" value={brand.supportEmail} mono />
            <InfoCard
              label="Approval Required"
              value={brand.contentGuardrails.approvalRequired ? "Yes" : "No"}
            />
          </div>

          {/* Theme swatch */}
          <div className="bg-white border rounded-xl p-5 mb-6">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Theme</h2>
            <div className="flex items-center gap-4">
              <ColorSwatch label="Primary" color={brand.theme.primaryColor} />
              <ColorSwatch label="Accent" color={brand.theme.accentColor} />
            </div>
          </div>

          {/* Social defaults */}
          <div className="bg-white border rounded-xl p-5 mb-6">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Social Defaults</h2>
            <dl className="space-y-1.5 text-sm">
              <Row k="X Handle" v={brand.socialDefaults.xHandle ?? "—"} />
              <Row k="LinkedIn Org" v={brand.socialDefaults.linkedinOrg ?? "—"} />
              <Row k="Default Hashtags" v={brand.socialDefaults.defaultHashtags.join(", ") || "—"} />
            </dl>
          </div>

          {/* Content guardrails */}
          <div className="bg-white border rounded-xl p-5 mb-6">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Content Guardrails</h2>
            <dl className="space-y-1.5 text-sm">
              <Row k="Privacy Language Required" v={brand.contentGuardrails.privacyLanguageRequired ? "Yes" : "No"} />
              <Row k="Approval Required" v={brand.contentGuardrails.approvalRequired ? "Yes" : "No"} />
              <Row k="Max Phase" v={String(brand.contentGuardrails.maxPhase)} />
              <Row
                k="Prohibited Terms"
                v={brand.contentGuardrails.prohibitedTerms.length
                  ? brand.contentGuardrails.prohibitedTerms.join(", ")
                  : "—"}
              />
            </dl>
          </div>

          {/* Full JSON */}
          <div className="bg-white border rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
              <span className="text-xs font-semibold text-gray-500">Full Config JSON</span>
              <button
                onClick={copyJson}
                className="text-xs text-indigo-600 hover:underline"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <pre className="text-xs text-gray-700 p-4 overflow-x-auto leading-relaxed font-mono max-h-96 overflow-y-auto">
              {configJson}
            </pre>
          </div>
        </>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function InfoCard({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="bg-white border rounded-xl p-4">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
      <p className={`text-sm font-medium text-gray-800 truncate ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

function ColorSwatch({ label, color }: { label: string; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="w-8 h-8 rounded-lg border border-gray-200 shadow-sm"
        style={{ backgroundColor: color }}
      />
      <div>
        <p className="text-xs font-medium text-gray-700">{label}</p>
        <p className="text-xs text-gray-400 font-mono">{color}</p>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-gray-500 shrink-0 w-44">{k}</dt>
      <dd className="text-gray-800 font-medium">{v}</dd>
    </div>
  );
}
