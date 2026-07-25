export type LatLng = { lat: number; lng: number };

export type MapStop = {
  id: string;
  lat: number;
  lng: number;
  label?: string;
  kind?: "pickup" | "dropoff" | "self" | "courier" | "job" | "default";
};

export const DEFAULT_CENTER: LatLng = { lat: 41.3111, lng: 69.2797 }; // Tashkent
export const DEFAULT_ZOOM = 12;

export type MapProvider = "yandex" | "leaflet";

/** Browser Maps JS API key. If set, Yandex Maps is preferred over Leaflet/OSM. */
export function yandexMapsApiKey(): string {
  try {
    // Next.js inlines NEXT_PUBLIC_* at build time in consuming apps.
    const fromProcess =
      typeof process !== "undefined" ? process.env?.NEXT_PUBLIC_YANDEX_MAPS_API_KEY : undefined;
    if (fromProcess && String(fromProcess).trim()) return String(fromProcess).trim();
  } catch {
    /* ignore */
  }
  return "";
}

export function getMapProvider(): MapProvider {
  return yandexMapsApiKey() ? "yandex" : "leaflet";
}

export function hasYandexMaps(): boolean {
  return getMapProvider() === "yandex";
}

export function envGet(key: string): string {
  try {
    if (typeof process !== "undefined" && process.env?.[key]) {
      return String(process.env[key]).trim();
    }
  } catch {
    /* ignore */
  }
  return "";
}

export function markerColor(kind: MapStop["kind"] = "default"): string {
  switch (kind) {
    case "pickup":
      return "var(--map-pickup, #0d7377)";
    case "dropoff":
      return "var(--map-dropoff, #e8a838)";
    case "self":
    case "courier":
      return "var(--map-self, #2563eb)";
    case "job":
      return "var(--map-job, #b45309)";
    default:
      return "#0b1f24";
  }
}

/** Resolved hex for Leaflet/Yandex APIs that need concrete colors. */
export function markerColorHex(kind: MapStop["kind"] = "default"): string {
  switch (kind) {
    case "pickup":
      return "#0d7377";
    case "dropoff":
      return "#e8a838";
    case "self":
    case "courier":
      return "#2563eb";
    case "job":
      return "#b45309";
    default:
      return "#0b1f24";
  }
}

/** Waypoints for driving path: optional origin (self/courier) then stops. */
export function routeWaypoints(stops: LatLng[], origin?: LatLng | null): LatLng[] {
  const pts: LatLng[] = [];
  if (origin && Number.isFinite(origin.lat) && Number.isFinite(origin.lng)) {
    pts.push({ lat: origin.lat, lng: origin.lng });
  }
  for (const s of stops) {
    if (Number.isFinite(s.lat) && Number.isFinite(s.lng)) pts.push({ lat: s.lat, lng: s.lng });
  }
  return pts;
}
