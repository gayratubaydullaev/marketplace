"use client";

import { useEffect } from "react";
import { ensureCartHydrated } from "@/lib/cart";

/** Rehydrate persisted cart after mount (skipHydration on the store). */
export function CartHydrator() {
  useEffect(() => {
    void ensureCartHydrated();
  }, []);
  return null;
}
