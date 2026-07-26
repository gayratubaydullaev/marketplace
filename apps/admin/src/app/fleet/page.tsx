"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@gayrat/ui";
import { Msg, PageHeader, Select } from "@/components/ui";
import { api, errMsg } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

const FleetMap = dynamic(() => import("@gayrat/map").then((m) => m.FleetMap), {
  ssr: false,
  loading: () => <div className="gayrat-map-skeleton h-[460px] rounded-2xl" />,
});

type Courier = {
  id: string;
  full_name: string;
  status: string;
  on_shift?: boolean;
  last_lat?: number | null;
  last_lng?: number | null;
  last_seen_at?: string | null;
  active_jobs?: number;
};

type Job = {
  id: string;
  order_number?: string;
  status: string;
  pickup_lat?: number | null;
  pickup_lng?: number | null;
  dropoff_lat?: number | null;
  dropoff_lng?: number | null;
  pickup_address?: string;
  dropoff_address?: string;
  courier_id?: string | null;
};

function ageLabel(iso: string | null | undefined, t: (k: string, p?: Record<string, string | number>) => string) {
  if (!iso) return t("fleetGpsUnknown");
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return t("fleetGpsUnknown");
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return t("fleetGpsJustNow");
  const min = Math.floor(sec / 60);
  if (min < 60) return t("fleetGpsMinutes", { n: min });
  return t("fleetGpsStale");
}

function gpsFreshness(iso: string | null | undefined): "fresh" | "warm" | "stale" | "unknown" {
  if (!iso) return "unknown";
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "unknown";
  if (ms < 2 * 60_000) return "fresh";
  if (ms < 10 * 60_000) return "warm";
  return "stale";
}

export default function FleetMapPage() {
  const { t } = useI18n();
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState("");
  const [selected, setSelected] = useState<{ id: string; kind: "courier" | "job" } | null>(null);
  const [assignCourier, setAssignCourier] = useState("");

  async function load() {
    const [cos, dels] = await Promise.all([
      api<{ items: Courier[] }>("/v1/admin/couriers"),
      api<{ items: Job[] }>("/v1/admin/deliveries"),
    ]);
    setCouriers(cos.items || []);
    setJobs(dels.items || []);
  }

  useEffect(() => {
    load().catch((e) => setMsg(errMsg(e)));
    const tmr = window.setInterval(() => {
      load().catch(() => {});
    }, 8000);
    return () => window.clearInterval(tmr);
  }, []);

  const courierById = useMemo(() => {
    const m = new Map<string, Courier>();
    for (const c of couriers) m.set(c.id, c);
    return m;
  }, [couriers]);

  const courierMarkers = useMemo(
    () =>
      couriers
        .filter((c) => c.on_shift && c.last_lat != null && c.last_lng != null)
        .map((c) => {
          const fresh = gpsFreshness(c.last_seen_at);
          const age = ageLabel(c.last_seen_at, t);
          return {
            id: c.id,
            lat: c.last_lat as number,
            lng: c.last_lng as number,
            label: `${c.full_name} · ${c.active_jobs || 0} · ${age}${fresh === "stale" ? " ⚠" : ""}`,
          };
        }),
    [couriers, t]
  );

  const jobMarkers = useMemo(() => {
    return jobs
      .filter((j) => !["delivered", "cancelled"].includes(j.status))
      .map((j) => {
        const toDrop = ["picked_up", "in_transit"].includes(j.status);
        const lat = toDrop ? j.dropoff_lat : j.pickup_lat;
        const lng = toDrop ? j.dropoff_lng : j.pickup_lng;
        if (lat == null || lng == null) return null;
        const phase = toDrop ? t("fleetLegendDropoff") : t("fleetLegendPickup");
        return {
          id: j.id,
          lat,
          lng,
          label: `${j.order_number || j.id.slice(0, 8)} · ${phase}`,
        };
      })
      .filter(Boolean) as { id: string; lat: number; lng: number; label: string }[];
  }, [jobs, t]);

  const selectedJob = selected?.kind === "job" ? jobs.find((j) => j.id === selected.id) : null;
  const selectedCourier = selected?.kind === "courier" ? couriers.find((c) => c.id === selected.id) : null;

  async function assign() {
    if (!selectedJob || !assignCourier) return;
    setMsg("");
    setOk("");
    await api(`/v1/admin/deliveries/${selectedJob.id}/assign`, {
      method: "POST",
      body: JSON.stringify({ courier_id: assignCourier }),
    });
    setOk(t("deliveryAssigned"));
    await load();
  }

  return (
    <div>
      <PageHeader title={t("pageFleetTitle")} description={t("pageFleetDesc")} />
      <Msg text={msg} />
      <Msg text={ok} tone="ok" />

      <div className="mt-4 overflow-hidden rounded-2xl border bg-white shadow-sm">
        <FleetMap
          height={460}
          couriers={courierMarkers}
          jobs={jobMarkers}
          empty={t("fleetEmpty")}
          legend={[
            { color: "#2563eb", label: t("fleetLegendCouriers") },
            { color: "#b45309", label: t("fleetLegendJobs") },
          ]}
          onSelect={(id, kind) => {
            setSelected({ id, kind });
            setAssignCourier("");
          }}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border bg-white p-4">
          <h2 className="font-semibold">{t("fleetOnShift")}</h2>
          <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto text-sm">
            {courierMarkers.length === 0 ? (
              <li className="text-slate-400">—</li>
            ) : (
              courierMarkers.map((c) => {
                const full = courierById.get(c.id);
                const fresh = gpsFreshness(full?.last_seen_at);
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      className={`w-full rounded-lg px-2 py-1.5 text-left hover:bg-slate-50 ${
                        selected?.id === c.id ? "bg-teal/10" : ""
                      }`}
                      onClick={() => setSelected({ id: c.id, kind: "courier" })}
                    >
                      <span className="font-medium">{full?.full_name || c.label}</span>
                      <span
                        className={`mt-0.5 block text-[11px] ${
                          fresh === "fresh"
                            ? "text-emerald-700"
                            : fresh === "warm"
                              ? "text-amber-700"
                              : "text-rose-600"
                        }`}
                      >
                        GPS · {ageLabel(full?.last_seen_at, t)}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
          <Link href="/couriers" className="mt-3 inline-block text-sm text-teal hover:underline">
            {t("navCouriers")} →
          </Link>
        </section>

        <section className="rounded-2xl border bg-white p-4">
          <h2 className="font-semibold">{t("fleetSelection")}</h2>
          {selectedJob ? (
            <div className="mt-2 space-y-3 text-sm">
              <p>
                <span className="text-slate-500">{t("navDeliveries")}: </span>
                {selectedJob.order_number || selectedJob.id.slice(0, 8)} · {selectedJob.status}
              </p>
              <p className="text-slate-600">
                {["picked_up", "in_transit"].includes(selectedJob.status)
                  ? selectedJob.dropoff_address || selectedJob.pickup_address || "—"
                  : selectedJob.pickup_address || "—"}
              </p>
              {!selectedJob.courier_id ? (
                <div className="flex flex-wrap items-end gap-2">
                  <label className="block min-w-[10rem] flex-1 text-xs font-medium text-slate-500">
                    {t("navCouriers")}
                    <Select
                      className="mt-1"
                      value={assignCourier}
                      onChange={(e) => setAssignCourier(e.target.value)}
                    >
                      <option value="">—</option>
                      {couriers
                        .filter((c) => c.status === "active")
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.full_name}
                          </option>
                        ))}
                    </Select>
                  </label>
                  <Button
                    className="!px-3 !py-2 text-xs"
                    disabled={!assignCourier}
                    onClick={() => assign().catch((e) => setMsg(errMsg(e)))}
                  >
                    {t("deliveryAssign")}
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-teal">{t("deliveryAssigned")}</p>
              )}
              <Link
                href={`/deliveries?job=${selectedJob.id}`}
                className="inline-block text-teal hover:underline"
              >
                {t("navDeliveries")} →
              </Link>
            </div>
          ) : selectedCourier ? (
            <div className="mt-2 space-y-2 text-sm">
              <p className="font-medium">{selectedCourier.full_name}</p>
              <p className="text-slate-500">
                {selectedCourier.on_shift ? t("fleetOnShift") : selectedCourier.status} ·{" "}
                {selectedCourier.active_jobs || 0} jobs
              </p>
              <p
                className={`text-xs ${
                  gpsFreshness(selectedCourier.last_seen_at) === "fresh"
                    ? "text-emerald-700"
                    : gpsFreshness(selectedCourier.last_seen_at) === "warm"
                      ? "text-amber-700"
                      : "text-rose-600"
                }`}
              >
                GPS · {ageLabel(selectedCourier.last_seen_at, t)}
                {selectedCourier.last_lat != null && selectedCourier.last_lng != null
                  ? ` · ${selectedCourier.last_lat.toFixed(4)}, ${selectedCourier.last_lng.toFixed(4)}`
                  : ""}
              </p>
              <Link href="/couriers" className="inline-block text-teal hover:underline">
                {t("navCouriers")} →
              </Link>
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-400">{t("fleetSelectHint")}</p>
          )}
        </section>
      </div>
    </div>
  );
}
