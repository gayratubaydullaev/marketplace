"use client";

import { mapLinks, type MapLinks } from "./navigation";
import type { LatLng } from "./config";

export type MapNavLabels = {
  yandexNavi?: string;
  yandex?: string;
  google?: string;
};

const DEFAULT_LABELS: Required<MapNavLabels> = {
  yandexNavi: "Yandex Navigator",
  yandex: "Yandex Maps",
  google: "Google Maps",
};

/**
 * Single row of external navigation deep-links (no Leaflet — safe for SSR).
 */
export function MapNavLinks({
  lat,
  lng,
  address,
  from,
  labels,
  className = "",
  compact = false,
}: {
  lat?: number | null;
  lng?: number | null;
  address?: string;
  from?: LatLng | null;
  labels?: MapNavLabels;
  className?: string;
  /** Primary + one secondary only. */
  compact?: boolean;
}) {
  const links: MapLinks = mapLinks(lat, lng, address, from);
  const L = { ...DEFAULT_LABELS, ...labels };
  const hasTarget =
    (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) || Boolean(address?.trim());
  if (!hasTarget) return null;

  return (
    <div className={`gayrat-map-nav ${className}`.trim()}>
      <a className="gayrat-map-nav__primary" href={links.yandexNavi}>
        {L.yandexNavi}
      </a>
      <a className="gayrat-map-nav__secondary" href={links.yandex} target="_blank" rel="noreferrer">
        {L.yandex}
      </a>
      {!compact ? (
        <a className="gayrat-map-nav__secondary" href={links.google} target="_blank" rel="noreferrer">
          {L.google}
        </a>
      ) : null}
    </div>
  );
}
