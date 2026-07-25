"use client";

import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  markerColorHex,
  routeWaypoints as buildRouteWaypoints,
  yandexMapsApiKey,
  type LatLng,
  type MapStop,
} from "./config";
import { MapFrame } from "./frame";
import {
  LeafletFleetMap,
  LeafletLocationPicker,
  LeafletMapView,
  LeafletRouteMap,
  LeafletTrackingMap,
} from "./leaflet";

type YMaps = {
  ready: (cb: () => void) => void;
  Map: new (
    el: HTMLElement | string,
    opts: { center: [number, number]; zoom: number; controls?: string[] }
  ) => YMap;
  Placemark: new (
    coords: [number, number],
    props?: { balloonContent?: string; hintContent?: string },
    opts?: Record<string, unknown>
  ) => YPlacemark;
  Polyline: new (
    coords: [number, number][],
    props?: Record<string, unknown>,
    opts?: Record<string, unknown>
  ) => { geometry: unknown };
  multiRouter?: {
    MultiRoute: new (
      model: { referencePoints: [number, number][]; params?: { routingMode?: string } },
      opts?: Record<string, unknown>
    ) => { model: unknown };
  };
};

type YMap = {
  destroy: () => void;
  setCenter: (c: [number, number], zoom?: number, opts?: { duration?: number }) => void;
  setZoom: (z: number) => void;
  setBounds: (b: number[][], opts?: { checkZoomRange?: boolean; zoomMargin?: number }) => void;
  geoObjects: { add: (o: YPlacemark) => void; removeAll: () => void };
  events: { add: (type: string, fn: (e: { get: (k: string) => unknown }) => void) => void };
};

type YPlacemark = {
  events: { add: (type: string, fn: () => void) => void };
  geometry: { setCoordinates: (c: [number, number]) => void; getCoordinates: () => [number, number] };
};

declare global {
  interface Window {
    ymaps?: YMaps;
  }
}

let loadPromise: Promise<YMaps> | null = null;

function loadYmaps(): Promise<YMaps> {
  if (typeof window === "undefined") return Promise.reject(new Error("ssr"));
  if (window.ymaps) {
    return new Promise((resolve) => window.ymaps!.ready(() => resolve(window.ymaps!)));
  }
  if (loadPromise) return loadPromise;
  const key = yandexMapsApiKey();
  if (!key) return Promise.reject(new Error("no yandex maps key"));

  loadPromise = new Promise((resolve, reject) => {
    const finish = () => {
      if (!window.ymaps) {
        loadPromise = null;
        reject(new Error("ymaps missing"));
        return;
      }
      window.ymaps.ready(() => resolve(window.ymaps!));
    };
    const fail = (err: Error) => {
      loadPromise = null;
      reject(err);
    };

    const existing = document.querySelector<HTMLScriptElement>("script[data-gayrat-ymaps]");
    if (existing) {
      if (window.ymaps) {
        finish();
        return;
      }
      // Script already in DOM — may have loaded before our listener.
      if (existing.dataset.loaded === "1") {
        finish();
        return;
      }
      existing.addEventListener("load", () => {
        existing.dataset.loaded = "1";
        finish();
      });
      existing.addEventListener("error", () => fail(new Error("ymaps script failed")));
      // Race: if ymaps appeared between checks
      window.setTimeout(() => {
        if (window.ymaps) finish();
      }, 50);
      return;
    }
    const s = document.createElement("script");
    s.src = `https://api-maps.yandex.ru/2.1/?apikey=${encodeURIComponent(key)}&lang=ru_RU&load=package.full`;
    s.async = true;
    s.dataset.gayratYmaps = "1";
    s.onload = () => {
      s.dataset.loaded = "1";
      finish();
    };
    s.onerror = () => fail(new Error("ymaps load error"));
    document.head.appendChild(s);
  });
  return loadPromise;
}

function placemarkOpts(kind: MapStop["kind"]) {
  const color = markerColorHex(kind);
  return {
    preset: "islands#circleIcon",
    iconColor: color,
    draggable: false,
  };
}

function useYmapsReady() {
  const [ymaps, setYmaps] = useState<YMaps | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    loadYmaps()
      .then((y) => {
        if (!cancelled) setYmaps(y);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return { ymaps, error };
}

function fitOrCenter(map: YMap, points: LatLng[], zoom: number) {
  const valid = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (valid.length === 0) return;
  if (valid.length === 1) {
    map.setCenter([valid[0].lat, valid[0].lng], Math.max(zoom, 14), { duration: 200 });
    return;
  }
  const lats = valid.map((p) => p.lat);
  const lngs = valid.map((p) => p.lng);
  map.setBounds(
    [
      [Math.min(...lats), Math.min(...lngs)],
      [Math.max(...lats), Math.max(...lngs)],
    ],
    { checkZoomRange: true, zoomMargin: 40 }
  );
}

function YandexShell({
  className,
  height,
  children,
  error,
  ready,
}: {
  className?: string;
  height?: number;
  children: React.ReactNode;
  error: boolean;
  ready: boolean;
}) {
  return (
    <div
      className={`gayrat-map gayrat-map--yandex ${className || ""}`.trim()}
      style={{ width: "100%", height: "100%", minHeight: height ? undefined : 160 }}
    >
      {!ready && !error ? <div className="gayrat-map-skeleton" style={{ height: "100%" }} /> : null}
      {children}
    </div>
  );
}

export function YandexMapView({
  center = DEFAULT_CENTER,
  zoom = DEFAULT_ZOOM,
  className = "",
  markers = [],
  fitPoints,
  followCenter = false,
  onClick,
  onMarkerClick,
  height,
  routeWaypoints,
  path,
}: {
  center?: LatLng;
  zoom?: number;
  className?: string;
  markers?: MapStop[];
  fitPoints?: LatLng[];
  followCenter?: boolean;
  onClick?: (ll: LatLng) => void;
  onMarkerClick?: (id: string, kind: MapStop["kind"]) => void;
  height?: number;
  /** When set, draws Yandex multiRouter (or polyline fallback) A→B. */
  routeWaypoints?: LatLng[];
  path?: LatLng[];
}) {
  const { ymaps, error } = useYmapsReady();
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<YMap | null>(null);
  const onClickRef = useRef(onClick);
  onClickRef.current = onClick;

  useEffect(() => {
    if (error || !ymaps || !ref.current) return;
    const map = new ymaps.Map(ref.current, {
      center: [center.lat, center.lng],
      zoom,
      controls: ["zoomControl", "geolocationControl"],
    });
    mapRef.current = map;
    map.events.add("click", (e) => {
      const fn = onClickRef.current;
      if (!fn) return;
      const coords = e.get("coords") as [number, number];
      fn({ lat: coords[0], lng: coords[1] });
    });
    return () => {
      map.destroy();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ymaps, error]);

  useEffect(() => {
    if (error) return;
    const map = mapRef.current;
    if (!map || !ymaps) return;
    map.geoObjects.removeAll();

    const waypoints = (routeWaypoints || []).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
    const linePts = (path || []).filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));

    // Prefer Yandex multiRouter when waypoints given; OSRM/polyline path is fallback.
    if (waypoints.length >= 2 && ymaps.multiRouter?.MultiRoute) {
      try {
        const multi = new ymaps.multiRouter.MultiRoute(
          {
            referencePoints: waypoints.map((p) => [p.lat, p.lng] as [number, number]),
            params: { routingMode: "auto" },
          },
          {
            boundsAutoApply: false,
            routeActiveStrokeWidth: 5,
            routeActiveStrokeColor: "#0d7377",
            wayPointVisible: false,
            viaPointVisible: false,
          }
        );
        map.geoObjects.add(multi as unknown as YPlacemark);
      } catch {
        map.geoObjects.add(
          new ymaps.Polyline(
            waypoints.map((p) => [p.lat, p.lng] as [number, number]),
            {},
            { strokeColor: "#0d7377", strokeWidth: 5, strokeOpacity: 0.85 }
          ) as unknown as YPlacemark
        );
      }
    } else if (linePts.length >= 2) {
      map.geoObjects.add(
        new ymaps.Polyline(
          linePts.map((p) => [p.lat, p.lng] as [number, number]),
          {},
          { strokeColor: "#0d7377", strokeWidth: 5, strokeOpacity: 0.85 }
        ) as unknown as YPlacemark
      );
    } else if (waypoints.length >= 2) {
      map.geoObjects.add(
        new ymaps.Polyline(
          waypoints.map((p) => [p.lat, p.lng] as [number, number]),
          {},
          { strokeColor: "#0d7377", strokeWidth: 5, strokeOpacity: 0.85 }
        ) as unknown as YPlacemark
      );
    }

    for (const m of markers) {
      if (!Number.isFinite(m.lat) || !Number.isFinite(m.lng)) continue;
      const pm = new ymaps.Placemark(
        [m.lat, m.lng],
        { balloonContent: m.label || "", hintContent: m.label || "" },
        placemarkOpts(m.kind)
      );
      if (onMarkerClick) {
        pm.events.add("click", () => onMarkerClick(m.id, m.kind));
      }
      map.geoObjects.add(pm);
    }
    if (fitPoints && fitPoints.length > 0) {
      fitOrCenter(map, fitPoints, zoom);
    } else if (followCenter) {
      map.setCenter([center.lat, center.lng], zoom, { duration: 200 });
    }
  }, [
    error,
    ymaps,
    markers,
    fitPoints,
    followCenter,
    center.lat,
    center.lng,
    zoom,
    onMarkerClick,
    routeWaypoints,
    path,
  ]);

  if (error) {
    return (
      <div className={className} style={height ? { height, minHeight: height } : undefined}>
        <LeafletMapView
          center={center}
          zoom={zoom}
          markers={markers}
          fitPoints={fitPoints}
          followCenter={followCenter}
          path={path}
        />
      </div>
    );
  }

  return (
    <YandexShell className={className} height={height} error={false} ready={!!ymaps}>
      <div ref={ref} style={{ width: "100%", height: "100%" }} />
    </YandexShell>
  );
}

export function YandexLocationPicker({
  value,
  onChange,
  className = "",
  height = 280,
}: {
  value: LatLng | null;
  onChange: (ll: LatLng) => void;
  className?: string;
  height?: number;
}) {
  const { error } = useYmapsReady();
  if (error) return <LeafletLocationPicker value={value} onChange={onChange} className={className} height={height} />;
  const center = value || DEFAULT_CENTER;
  const markers: MapStop[] = value
    ? [{ id: "pin", lat: value.lat, lng: value.lng, kind: "default", label: "Pin" }]
    : [];
  return (
    <MapFrame height={height} className={className}>
      <YandexMapView
        center={center}
        zoom={value ? 15 : DEFAULT_ZOOM}
        markers={markers}
        followCenter
        onClick={onChange}
      />
    </MapFrame>
  );
}

export function YandexRouteMap({
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
  const { error } = useYmapsReady();

  if (error) {
    return (
      <LeafletRouteMap
        stops={stops}
        self={self}
        className={className}
        height={height}
        showRoute={showRoute}
        empty={empty}
        legend={legend}
      />
    );
  }

  const markers: MapStop[] = [
    ...stops,
    ...(self ? [{ id: "self", lat: self.lat, lng: self.lng, label: "You", kind: "self" as const }] : []),
  ];
  const fit = markers.map((m) => ({ lat: m.lat, lng: m.lng }));
  const waypoints = showRoute
    ? buildRouteWaypoints(
        stops.map((s) => ({ lat: s.lat, lng: s.lng })),
        self
      )
    : [];

  return (
    <MapFrame
      height={height}
      className={className}
      empty={markers.length === 0 ? empty || null : null}
      legend={legend}
    >
      <YandexMapView
        center={fit[0] || DEFAULT_CENTER}
        markers={markers}
        fitPoints={fit.length ? fit : undefined}
        routeWaypoints={waypoints.length >= 2 ? waypoints : undefined}
      />
    </MapFrame>
  );
}

export function YandexTrackingMap({
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
  const { error } = useYmapsReady();

  if (error) {
    return (
      <LeafletTrackingMap
        dropoff={dropoff}
        courier={courier}
        className={className}
        height={height}
        showRoute={showRoute}
        empty={empty}
      />
    );
  }

  const markers: MapStop[] = [];
  if (dropoff) markers.push({ id: "dropoff", ...dropoff, kind: "dropoff", label: "Delivery" });
  if (courier) markers.push({ id: "courier", ...courier, kind: "courier", label: "Courier" });
  const fit = markers.map((m) => ({ lat: m.lat, lng: m.lng }));
  const waypoints =
    showRoute && courier && dropoff
      ? [
          { lat: courier.lat, lng: courier.lng },
          { lat: dropoff.lat, lng: dropoff.lng },
        ]
      : [];

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
      <YandexMapView
        center={fit[0] || DEFAULT_CENTER}
        markers={markers}
        fitPoints={fit.length ? fit : undefined}
        routeWaypoints={waypoints.length >= 2 ? waypoints : undefined}
      />
    </MapFrame>
  );
}

export function YandexFleetMap({
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
  const { error } = useYmapsReady();
  if (error) {
    return (
      <LeafletFleetMap
        couriers={couriers}
        jobs={jobs}
        className={className}
        height={height}
        onSelect={onSelect}
        empty={empty}
        legend={legend}
      />
    );
  }
  const markers: MapStop[] = [
    ...couriers.map((c) => ({ ...c, kind: "courier" as const })),
    ...jobs.map((j) => ({ ...j, kind: "job" as const })),
  ];
  const fit = markers.map((m) => ({ lat: m.lat, lng: m.lng }));
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
      <YandexMapView
        center={fit[0] || DEFAULT_CENTER}
        markers={markers}
        fitPoints={fit.length ? fit : undefined}
        onMarkerClick={(id, kind) => onSelect?.(id, kind === "job" ? "job" : "courier")}
      />
    </MapFrame>
  );
}
