/** Fire-and-forget analytics via same-origin BFF (cookies, no bearer in JS). */

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

  // Same-origin BFF — Authorization / guest from httpOnly cookies.
  void fetch("/api/gateway/analytics/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    credentials: "same-origin",
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
