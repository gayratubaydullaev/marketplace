import type { LatLng } from "./config";
import { getMapProvider } from "./config";

export type MapLinks = {
  google: string;
  /** Yandex Maps web (route if `from` given). */
  yandex: string;
  /** Yandex Navigator app deep-link (falls back to web maps if app missing). */
  yandexNavi: string;
  geo: string;
  provider: "yandex" | "leaflet";
};

/**
 * Deep-links for maps / navigation.
 * Yandex Navigator / Maps web links work without Maps JS API key.
 */
export function mapLinks(
  lat?: number | null,
  lng?: number | null,
  address?: string,
  from?: LatLng | null
): MapLinks {
  const hasCoords = lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng);
  const textQ = hasCoords ? `${lat},${lng}` : encodeURIComponent(address || "");

  const google = hasCoords
    ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
    : `https://www.google.com/maps/search/?api=1&query=${textQ}`;

  let yandex: string;
  if (hasCoords && from && Number.isFinite(from.lat) && Number.isFinite(from.lng)) {
    yandex = `https://yandex.ru/maps/?rtext=${from.lat},${from.lng}~${lat},${lng}&rtt=auto`;
  } else if (hasCoords) {
    yandex = `https://yandex.ru/maps/?rtext=~${lat},${lng}&rtt=auto`;
  } else {
    yandex = `https://yandex.ru/maps/?text=${textQ}`;
  }

  const yandexNavi = hasCoords
    ? `yandexnavi://build_route_on_map?lat_to=${lat}&lon_to=${lng}`
    : yandex;

  return {
    google,
    yandex,
    yandexNavi,
    geo: hasCoords ? `geo:${lat},${lng}` : `geo:0,0?q=${textQ}`,
    provider: getMapProvider(),
  };
}
