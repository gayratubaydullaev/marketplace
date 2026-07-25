import { TENANT_ID } from "@/lib/api";

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8080").replace(/\/$/, "");

export type AnalyticsEventType =
  | "banner_impression"
  | "banner_click"
  | "product_impression"
  | "product_click"
  | "product_view"
  | "add_to_cart"
  | "wishlist_add";

function sessionId(): string {
  if (typeof window === "undefined") return "";
  const key = "gayrat_sid";
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(key, id);
  }
  return id;
}

/** Fire-and-forget analytics event (no throw). Dedupes impressions per session+entity. */
export function track(
  eventType: AnalyticsEventType,
  entityId: string,
  payload: Record<string, unknown> = {}
) {
  if (typeof window === "undefined" || !entityId) return;

  if (eventType.endsWith("_impression") || eventType === "product_view") {
    const dedupeKey = `ae:${eventType}:${entityId}`;
    try {
      if (sessionStorage.getItem(dedupeKey)) return;
      sessionStorage.setItem(dedupeKey, "1");
    } catch {
      /* private mode */
    }
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Tenant-ID": TENANT_ID,
  };
  // Prefer anonymous ingest when access token looks expired — avoids 401 noise.
  try {
    const token = localStorage.getItem("access_token");
    if (token) {
      const part = token.split(".")[1];
      if (part) {
        const payload = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/"))) as { exp?: number };
        if (!payload.exp || payload.exp * 1000 > Date.now() + 5_000) {
          headers.Authorization = `Bearer ${token}`;
        }
      }
    }
  } catch {
    /* ignore */
  }

  const body = JSON.stringify({
    event_type: eventType,
    entity_id: entityId,
    session_id: sessionId(),
    payload: {
      ...payload,
      path: window.location.pathname,
      locale: payload.locale || window.location.pathname.split("/")[1] || "uz",
    },
  });

  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      // sendBeacon cannot set custom headers — fall back to fetch
      if (!headers.Authorization) {
        // Still need tenant header — use fetch
      }
    }
  } catch {
    /* ignore */
  }

  void fetch(`${API_BASE}/v1/analytics/events`, {
    method: "POST",
    headers,
    body,
    keepalive: true,
    cache: "no-store",
  }).catch(() => undefined);
}

/** Observe element once in viewport → impression. */
export function trackImpressionOnce(
  el: Element | null,
  eventType: "banner_impression" | "product_impression",
  entityId: string,
  payload?: Record<string, unknown>
) {
  if (!el || !entityId || typeof IntersectionObserver === "undefined") return () => undefined;
  const obs = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && entry.intersectionRatio >= 0.45) {
          track(eventType, entityId, payload);
          obs.disconnect();
          break;
        }
      }
    },
    { threshold: [0.45] }
  );
  obs.observe(el);
  return () => obs.disconnect();
}
