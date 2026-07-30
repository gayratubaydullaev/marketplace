"use client";

import { useEffect, useState } from "react";
import { apiPublic, publicTags } from "@/lib/api";

export type VendorInfo = {
  id: string;
  name: string;
  slug: string;
  rating?: number;
};

let cache: Record<string, VendorInfo> | null = null;
let inflight: Promise<Record<string, VendorInfo>> | null = null;

async function loadVendors(): Promise<Record<string, VendorInfo>> {
  if (cache) return cache;
  if (!inflight) {
    inflight = apiPublic<{ items: VendorInfo[] }>("/v1/vendors", {
      revalidate: 120,
      tags: publicTags("vendors"),
    })
      .then((d) => {
        const map: Record<string, VendorInfo> = {};
        for (const v of d.items || []) {
          if (v?.id) map[v.id] = v;
        }
        cache = map;
        return map;
      })
      .catch(() => {
        cache = {};
        return cache;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Shared vendor map for product cards (single network fetch). */
export function useVendorMap() {
  const [vendors, setVendors] = useState<Record<string, VendorInfo>>(cache || {});

  useEffect(() => {
    let cancelled = false;
    loadVendors().then((map) => {
      if (!cancelled) setVendors(map);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return vendors;
}
