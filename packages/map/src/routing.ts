import type { LatLng } from "./config";

/** Fetch a driving path via public OSRM; falls back to straight segments. */
export async function fetchDrivingPath(points: LatLng[], timeoutMs = 8000): Promise<LatLng[]> {
  const valid = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (valid.length < 2) return valid;

  const coords = valid.map((p) => `${p.lng},${p.lat}`).join(";");
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  let timer: ReturnType<typeof setTimeout> | 0 = 0;
  if (ctrl) timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;
    const res = await fetch(url, ctrl ? { signal: ctrl.signal } : undefined);
    if (!res.ok) return valid;
    const data = (await res.json()) as {
      code?: string;
      routes?: { geometry?: { coordinates?: [number, number][] } }[];
    };
    const line = data.routes?.[0]?.geometry?.coordinates;
    if (!line || line.length < 2) return valid;
    return line.map(([lng, lat]) => ({ lat, lng }));
  } catch {
    return valid;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
