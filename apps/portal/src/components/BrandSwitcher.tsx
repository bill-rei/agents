"use client";

import { useRef, useState, useEffect } from "react";
import { useBrand } from "@/lib/useBrand";
import { BRAND_REGISTRY } from "@/config/brand";

const allBrands = Object.values(BRAND_REGISTRY);

/**
 * BrandSwitcher
 *
 * Dropdown shown in the nav when the user is an admin OR NODE_ENV=development.
 * Writes the chosen brandKey to the brandKey cookie via POST /api/brand and
 * triggers a full page refresh so all server components re-render with the new brand.
 */
export default function BrandSwitcher() {
  const { brand, loading, switchBrand } = useBrand();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  if (loading || allBrands.length <= 1) {
    // If only one brand registered, no switcher needed
    return null;
  }

  async function handleSwitch(key: string) {
    if (key === brand?.brandKey) {
      setOpen(false);
      return;
    }
    setSwitching(true);
    await switchBrand(key);
    setOpen(false);
    setSwitching(false);
    // Full refresh so server components pick up the new cookie
    window.location.reload();
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={switching}
        className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
        title="Switch active brand"
      >
        <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block" />
        {switching ? "Switching…" : (brand?.displayName ?? "Brand")}
        <span className="opacity-50 text-[10px]">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-lg border border-gray-100 py-1 min-w-[160px] z-50">
          <p className="px-3 pt-1 pb-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
            Active Brand
          </p>
          {allBrands.map((b) => (
            <button
              key={b.brandKey}
              onClick={() => handleSwitch(b.brandKey)}
              className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 transition-colors flex items-center gap-2 ${
                b.brandKey === brand?.brandKey ? "font-semibold text-indigo-600" : "text-gray-700"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${
                  b.brandKey === brand?.brandKey ? "bg-indigo-500" : "bg-gray-300"
                }`}
              />
              <span className="flex flex-col min-w-0">
                <span className="truncate">{b.displayName}</span>
                <span className="text-[10px] text-gray-400 font-normal truncate">{b.primaryDomain}</span>
              </span>
              {b.brandKey === brand?.brandKey && (
                <span className="ml-auto text-indigo-500 text-[10px]">active</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
