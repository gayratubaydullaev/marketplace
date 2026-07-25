"use client";

import { useEffect, useRef } from "react";

/** Soft refresh on an interval and when the tab becomes visible again. */
export function usePoll(fn: () => void | Promise<void>, ms: number, enabled = true) {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (!enabled || ms <= 0) return;
    let cancelled = false;
    const run = () => {
      if (!cancelled) void fnRef.current();
    };
    const id = window.setInterval(run, ms);
    const onVis = () => {
      if (document.visibilityState === "visible") run();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [ms, enabled]);
}
