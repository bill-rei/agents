"use client";

import { useEffect, useState, useCallback } from "react";
import type { BrandConfig } from "@/config/brand";

interface UseBrandResult {
  brand: BrandConfig | null;
  loading: boolean;
  switchBrand: (key: string) => Promise<void>;
}

/**
 * Client-side hook that fetches the resolved BrandConfig from /api/brand.
 * Respects the full resolution chain: query param → cookie → subdomain → env → fallback.
 */
export function useBrand(): UseBrandResult {
  const [brand, setBrand] = useState<BrandConfig | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchBrand = useCallback(async () => {
    try {
      const res = await fetch("/api/brand", { cache: "no-store" });
      if (res.ok) setBrand(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBrand();
  }, [fetchBrand]);

  const switchBrand = useCallback(async (key: string) => {
    const res = await fetch("/api/brand", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandKey: key }),
    });
    if (res.ok) {
      setBrand(await res.json());
    }
  }, []);

  return { brand, loading, switchBrand };
}
