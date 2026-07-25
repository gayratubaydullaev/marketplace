"use client";

import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import type { LatLngExpression, LeafletMouseEvent } from "leaflet";
import { useState, type ReactNode } from "react";
import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  envGet,
  markerColorHex,
  routeWaypoints,
  type LatLng,
  type MapStop,
} from "./config";
import { MapFrame } from "./frame";

function tileUrl() {
  return envGet("NEXT_PUBLIC_MAP_TILE_URL") || "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
}

const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

function pinIcon(kind: MapStop["kind"] = "default") {
  const color = markerColorHex(kind);
  return L.divIcon({
    className: "gayrat-map-marker-label",
    html: `<span style="display:block;width:18px;height:18px;border-radius:9999px;background:${color};border:2.5px solid #fff;box-shadow:0 2px 6px rgba(11,31,36,.35)"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function FitBounds({ points }: { points: LatLng[] }) {
  const map = useMap();
  useEffect(() => {
    const valid = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
    if (valid.length === 0) return;
    if (valid.length === 1) {
      map.setView([valid[0].lat, valid[0].lng], 14);
      return;
    }
    const bounds = L.latLngBounds(valid.map((p) => [p.lat, p.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [28, 28], maxZoom: 15 });
  }, [map, points]);
  return null;
}

function Recenter({ center, zoom }: { center: LatLng; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([center.lat, center.lng], zoom, { animate: true });
  }, [map, center.lat, center.lng, zoom]);
  useEffect(() => {
    const t = window.setTimeout(() => map.invalidateSize(), 50);
    return () => window.clearTimeout(t);
  }, [map]);
  return null;
}

function ClickHandler({ onPick }: { onPick: (ll: LatLng) => void }) {
  useMapEvents({
    click(e: LeafletMouseEvent) {
      onPick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

export function LeafletMapView({
  center = DEFAULT_CENTER,
  zoom = DEFAULT_ZOOM,
  className = "",
  children,
  markers = [],
  fitPoints,
  followCenter = false,
  path,
}: {
  center?: LatLng;
  zoom?: number;
  className?: string;
  children?: ReactNode;
  markers?: MapStop[];
  fitPoints?: LatLng[];
  followCenter?: boolean;
  /** Driving / route polyline (lat/lng). */
  path?: LatLng[];
}) {
  const c: LatLngExpression = [center.lat, center.lng];
  const line = (path || []).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  return (
    <div className={`gayrat-map ${className}`.trim()}>
      <MapContainer
        center={c}
        zoom={zoom}
        scrollWheelZoom
        className="h-full w-full"
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer attribution={ATTRIBUTION} url={tileUrl()} />
        {followCenter ? <Recenter center={center} zoom={zoom} /> : null}
        {fitPoints && fitPoints.length > 0 ? <FitBounds points={fitPoints} /> : null}
        {line.length >= 2 ? (
          <Polyline
            positions={line.map((p) => [p.lat, p.lng] as [number, number])}
            pathOptions={{
              color: "#0d7377",
              weight: 5,
              opacity: 0.9,
              lineCap: "round",
              lineJoin: "round",
            }}
          />
        ) : null}
        {markers.map((m) => (
          <Marker key={m.id} position={[m.lat, m.lng]} icon={pinIcon(m.kind)}>
            {m.label ? <Popup>{m.label}</Popup> : null}
          </Marker>
        ))}
        {children}
      </MapContainer>
    </div>
  );
}

export function LeafletLocationPicker({
  value,
  onChange,
  className = "",
  height = 260,
}: {
  value: LatLng | null;
  onChange: (ll: LatLng) => void;
  className?: string;
  height?: number;
}) {
  const center = value || DEFAULT_CENTER;
  const zoom = value ? 15 : DEFAULT_ZOOM;
  return (
    <MapFrame height={height} className={className}>
      <LeafletMapView className="gayrat-map--picker" center={center} zoom={zoom} markers={[]} followCenter>
        <ClickHandler onPick={onChange} />
        {value ? (
          <Marker
            position={[value.lat, value.lng]}
            icon={pinIcon("default")}
            draggable
            eventHandlers={{
              dragend(e) {
                const m = e.target as L.Marker;
                const ll = m.getLatLng();
                onChange({ lat: ll.lat, lng: ll.lng });
              },
            }}
          />
        ) : null}
      </LeafletMapView>
    </MapFrame>
  );
}

export function LeafletRouteMap({
  stops,
  self,
  className = "",
  height = 280,
  showRoute = true,
  empty,
  legend,
}: {
  stops: MapStop[];
  self?: LatLng | null;
  className?: string;
  height?: number;
  showRoute?: boolean;
  empty?: string | null;
  legend?: { color: string; label: string }[];
}) {
  const markers: MapStop[] = [
    ...stops,
    ...(self ? [{ id: "self", lat: self.lat, lng: self.lng, label: "You", kind: "self" as const }] : []),
  ];
  const fit = markers.map((m) => ({ lat: m.lat, lng: m.lng }));
  const center = fit[0] || DEFAULT_CENTER;
  const [path, setPath] = useState<LatLng[]>([]);
  const stopKey = stops.map((s) => `${s.id}:${s.lat},${s.lng}`).join("|");
  const selfKey = self ? `${self.lat},${self.lng}` : "";

  useEffect(() => {
    if (!showRoute) {
      setPath([]);
      return;
    }
    const waypoints = routeWaypoints(
      stops.map((s) => ({ lat: s.lat, lng: s.lng })),
      self
    );
    if (waypoints.length < 2) {
      setPath(waypoints.length === 1 ? [] : waypoints);
      return;
    }
    let cancelled = false;
    import("./routing")
      .then(({ fetchDrivingPath }) => fetchDrivingPath(waypoints))
      .then((pts) => {
        if (!cancelled) setPath(pts);
      })
      .catch(() => {
        if (!cancelled) setPath(waypoints);
      });
    return () => {
      cancelled = true;
    };
  }, [stopKey, selfKey, showRoute, stops, self]);

  return (
    <MapFrame
      height={height}
      className={className}
      empty={markers.length === 0 ? empty || null : null}
      legend={legend}
    >
      <LeafletMapView center={center} markers={markers} fitPoints={fit.length ? fit : undefined} path={path} />
    </MapFrame>
  );
}

export function LeafletTrackingMap({
  dropoff,
  courier,
  className = "",
  height = 280,
  showRoute = true,
  empty,
}: {
  dropoff?: LatLng | null;
  courier?: LatLng | null;
  className?: string;
  height?: number;
  showRoute?: boolean;
  empty?: string | null;
}) {
  const markers: MapStop[] = [];
  if (dropoff) markers.push({ id: "dropoff", ...dropoff, kind: "dropoff", label: "Delivery" });
  if (courier) markers.push({ id: "courier", ...courier, kind: "courier", label: "Courier" });
  const fit = markers.map((m) => ({ lat: m.lat, lng: m.lng }));
  const center = fit[0] || DEFAULT_CENTER;
  const [path, setPath] = useState<LatLng[]>([]);

  useEffect(() => {
    if (!showRoute || !courier || !dropoff) {
      setPath([]);
      return;
    }
    const waypoints = [
      { lat: courier.lat, lng: courier.lng },
      { lat: dropoff.lat, lng: dropoff.lng },
    ];
    let cancelled = false;
    import("./routing")
      .then(({ fetchDrivingPath }) => fetchDrivingPath(waypoints))
      .then((pts) => {
        if (!cancelled) setPath(pts);
      })
      .catch(() => {
        if (!cancelled) setPath(waypoints);
      });
    return () => {
      cancelled = true;
    };
  }, [showRoute, courier?.lat, courier?.lng, dropoff?.lat, dropoff?.lng, courier, dropoff]);

  return (
    <MapFrame
      height={height}
      className={className}
      empty={markers.length === 0 ? empty || null : null}
      legend={
        markers.length
          ? [
              ...(courier ? [{ color: "#2563eb", label: "Courier" }] : []),
              ...(dropoff ? [{ color: "#e8a838", label: "Delivery" }] : []),
            ]
          : undefined
      }
    >
      <LeafletMapView
        center={center}
        markers={markers}
        fitPoints={fit.length ? fit : undefined}
        path={path}
      />
    </MapFrame>
  );
}

export function LeafletFleetMap({
  couriers = [],
  jobs = [],
  className = "",
  height = 440,
  onSelect,
  empty,
  legend,
}: {
  couriers?: MapStop[];
  jobs?: MapStop[];
  className?: string;
  height?: number;
  onSelect?: (id: string, kind: "courier" | "job") => void;
  empty?: string | null;
  legend?: { color: string; label: string }[];
}) {
  const markers: MapStop[] = [
    ...couriers.map((c) => ({ ...c, kind: "courier" as const })),
    ...jobs.map((j) => ({ ...j, kind: "job" as const })),
  ];
  const fit = markers.map((m) => ({ lat: m.lat, lng: m.lng }));
  const center = fit[0] || DEFAULT_CENTER;
  return (
    <MapFrame
      height={height}
      className={className}
      empty={markers.length === 0 ? empty || "No courier or job locations yet" : null}
      legend={
        legend ||
        (markers.length
          ? [
              { color: "#2563eb", label: "Couriers" },
              { color: "#b45309", label: "Jobs" },
            ]
          : undefined)
      }
    >
      <LeafletMapView center={center} markers={[]} fitPoints={fit.length ? fit : undefined}>
        {markers.map((m) => (
          <Marker
            key={m.id}
            position={[m.lat, m.lng]}
            icon={pinIcon(m.kind)}
            eventHandlers={{
              click: () => onSelect?.(m.id, m.kind === "job" ? "job" : "courier"),
            }}
          >
            {m.label ? <Popup>{m.label}</Popup> : null}
          </Marker>
        ))}
      </LeafletMapView>
    </MapFrame>
  );
}
