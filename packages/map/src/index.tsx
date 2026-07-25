"use client";

import "./styles.css";

import type { ComponentProps } from "react";
import { hasYandexMaps, type LatLng, type MapStop } from "./config";
import {
  LeafletFleetMap,
  LeafletLocationPicker,
  LeafletMapView,
  LeafletRouteMap,
  LeafletTrackingMap,
} from "./leaflet";
import {
  YandexFleetMap,
  YandexLocationPicker,
  YandexMapView,
  YandexRouteMap,
  YandexTrackingMap,
} from "./yandex";

export type { LatLng, MapStop, MapProvider } from "./config";
export {
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
  getMapProvider,
  hasYandexMaps,
  yandexMapsApiKey,
  markerColorHex,
  routeWaypoints,
} from "./config";
export { mapLinks, type MapLinks } from "./navigation";
export { fetchDrivingPath } from "./routing";
export { MapFrame, MapSkeleton, type MapLegendItem } from "./frame";
export { MapNavLinks, type MapNavLabels } from "./MapNavLinks";

export function MapView(props: ComponentProps<typeof LeafletMapView> & { height?: number }) {
  if (hasYandexMaps()) {
    return (
      <YandexMapView
        center={props.center}
        zoom={props.zoom}
        className={props.className}
        markers={props.markers}
        fitPoints={props.fitPoints}
        followCenter={props.followCenter}
        path={props.path}
        height={props.height}
      />
    );
  }
  return <LeafletMapView {...props} />;
}

export function LocationPicker(props: {
  value: LatLng | null;
  onChange: (ll: LatLng) => void;
  className?: string;
  height?: number;
}) {
  if (hasYandexMaps()) return <YandexLocationPicker {...props} />;
  return <LeafletLocationPicker {...props} />;
}

export function RouteMap(props: {
  stops: MapStop[];
  self?: LatLng | null;
  className?: string;
  height?: number;
  showRoute?: boolean;
  empty?: string | null;
  legend?: { color: string; label: string }[];
}) {
  if (hasYandexMaps()) return <YandexRouteMap {...props} />;
  return <LeafletRouteMap {...props} />;
}

export function TrackingMap(props: {
  dropoff?: LatLng | null;
  courier?: LatLng | null;
  className?: string;
  height?: number;
  showRoute?: boolean;
  empty?: string | null;
}) {
  if (hasYandexMaps()) return <YandexTrackingMap {...props} />;
  return <LeafletTrackingMap {...props} />;
}

export function FleetMap(props: {
  couriers?: MapStop[];
  jobs?: MapStop[];
  className?: string;
  height?: number;
  onSelect?: (id: string, kind: "courier" | "job") => void;
  empty?: string | null;
  legend?: { color: string; label: string }[];
}) {
  if (hasYandexMaps()) return <YandexFleetMap {...props} />;
  return <LeafletFleetMap {...props} />;
}
