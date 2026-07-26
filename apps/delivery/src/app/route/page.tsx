"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@gayrat/ui";
import { api, errMsg } from "@/lib/api";
import { MapNavLinks } from "@gayrat/map/nav";
import { useI18n } from "@/lib/i18n";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState, Msg } from "@/components/ui";
import { usePoll } from "@/hooks/usePoll";

const RouteMap = dynamic(() => import("@gayrat/map").then((m) => m.RouteMap), {
  ssr: false,
  loading: () => <div className="gayrat-map-skeleton mt-4 h-[300px] rounded-2xl" />,
});

type Stop = {
  id: string;
  status: string;
  order_number?: string;
  sequence: number;
  pickup_address: string;
  dropoff_address: string;
  pickup_lat?: number | null;
  pickup_lng?: number | null;
  dropoff_lat?: number | null;
  dropoff_lng?: number | null;
  cod_amount?: number;
};

type Me = {
  courier?: { last_lat?: number | null; last_lng?: number | null };
};

export default function RoutePage() {
  const { t } = useI18n();
  const [stops, setStops] = useState<Stop[]>([]);
  const [self, setSelf] = useState<{ lat: number; lng: number } | null>(null);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (soft = false) => {
    if (!soft) setLoading(true);
    try {
      const [d, me] = await Promise.all([
        api<{ stops: Stop[] }>("/v1/courier/route"),
        api<Me>("/v1/courier/me"),
      ]);
      setStops(d.stops || []);
      if (me.courier?.last_lat != null && me.courier?.last_lng != null) {
        setSelf({ lat: me.courier.last_lat, lng: me.courier.last_lng });
      }
      setMsg("");
    } catch (e) {
      setMsg(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setSelf({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 30_000 }
    );
  }, [load]);

  usePoll(() => load(true), 20_000, true);

  const mapStops = useMemo(() => {
    return stops
      .map((s) => {
        const useDrop = ["picked_up", "in_transit"].includes(s.status);
        const lat = useDrop ? s.dropoff_lat : s.pickup_lat;
        const lng = useDrop ? s.dropoff_lng : s.pickup_lng;
        if (lat == null || lng == null) return null;
        return {
          id: s.id,
          lat,
          lng,
          label: `${s.sequence || ""} ${s.order_number || s.id.slice(0, 8)}`.trim(),
          kind: useDrop ? ("dropoff" as const) : ("pickup" as const),
        };
      })
      .filter(Boolean) as { id: string; lat: number; lng: number; label: string; kind: "pickup" | "dropoff" }[];
  }, [stops]);

  const nextStop = stops[0];
  const nextUseDrop = nextStop ? ["picked_up", "in_transit"].includes(nextStop.status) : false;

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <h1 className="font-display text-2xl font-bold">{t("routeTitle")}</h1>
        <Button variant="secondary" className="!px-3 !py-2 text-xs" onClick={() => load()} disabled={loading}>
          {t("routeRefresh")}
        </Button>
      </div>
      <Msg text={msg} onRetry={() => load()} retryLabel={t("commonRetry")} />

      {loading ? <div className="gayrat-map-skeleton mt-4 h-[300px] rounded-2xl" /> : null}

      {!loading && mapStops.length > 0 ? (
        <div className="mt-4 overflow-hidden rounded-2xl border bg-white shadow-sm">
          <RouteMap
            stops={mapStops}
            self={self}
            height={300}
            showRoute
            legend={[
              { color: "#0d7377", label: t("jobPickup") },
              { color: "#e8a838", label: t("jobDropoff") },
              ...(self ? [{ color: "#2563eb", label: t("gpsShort") }] : []),
            ]}
          />
        </div>
      ) : null}

      {!loading && nextStop ? (
        <div className="mt-3 rounded-2xl border bg-white p-4 shadow-sm">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
            {t("routeNavigate")} · {nextStop.order_number || nextStop.id.slice(0, 8)}
          </p>
          <MapNavLinks
            lat={nextUseDrop ? nextStop.dropoff_lat : nextStop.pickup_lat}
            lng={nextUseDrop ? nextStop.dropoff_lng : nextStop.pickup_lng}
            address={nextUseDrop ? nextStop.dropoff_address : nextStop.pickup_address}
            from={self}
            labels={{
              yandexNavi: t("jobMapsYandexNavi"),
              yandex: t("jobMapsYandex"),
              google: t("jobMapsGoogle"),
            }}
          />
        </div>
      ) : null}

      {!loading && stops.length === 0 ? (
        <div className="mt-6">
          <EmptyState text={t("routeEmpty")} />
        </div>
      ) : null}

      {!loading && stops.length > 0 ? (
        <ol className="mt-4 space-y-3">
          {stops.map((s, i) => {
            const useDrop = ["picked_up", "in_transit"].includes(s.status);
            const addr = useDrop ? s.dropoff_address : s.pickup_address;
            return (
              <li key={s.id} className="rounded-2xl border bg-white p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal text-sm font-bold text-white">
                    {s.sequence || i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/jobs/${s.id}`} className="font-semibold text-night hover:text-teal">
                        {s.order_number || s.id.slice(0, 8)}
                      </Link>
                      <StatusBadge status={s.status} />
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {useDrop ? t("jobDropoff") : t("jobPickup")}: {addr || "—"}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}
