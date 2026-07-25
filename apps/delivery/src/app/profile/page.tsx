"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@gayrat/ui";
import { api, errMsg, logout } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { Msg } from "@/components/ui";
import { emitShiftChange, money } from "@/lib/status";

type Courier = {
  id: string;
  full_name: string;
  phone: string;
  email?: string;
  rating_avg: number;
  rating_count: number;
  vehicle_type: string;
  status: string;
  active_jobs?: number;
  last_seen_at?: string;
};

type Payout = {
  id: string;
  amount: number;
  status: string;
  period_start: string;
  period_end: string;
  currency: string;
};

type Shift = { status?: string; started_at?: string } | null;

type Earnings = {
  currency?: string;
  earned_today?: number;
  completed_today?: number;
  earned_unpaid?: number;
  completed_total?: number;
};

const VEHICLES = ["bike", "moto", "car", "walk"] as const;

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "K";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function formatShiftDuration(
  startedAt: string | undefined,
  t: (key: string, vars?: Record<string, string | number>) => string
) {
  if (!startedAt) return "";
  const start = new Date(startedAt).getTime();
  if (!Number.isFinite(start)) return "";
  const mins = Math.max(0, Math.floor((Date.now() - start) / 60_000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h <= 0) return t("shiftMins", { m });
  return t("shiftHoursMins", { h, m });
}

export default function ProfilePage() {
  const { t, locale } = useI18n();
  const numberLocale = locale === "uz" ? "uz-UZ" : locale === "en" ? "en-US" : "ru-RU";
  const [courier, setCourier] = useState<Courier | null>(null);
  const [shift, setShift] = useState<Shift>(null);
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState("");
  const [loading, setLoading] = useState(true);
  const [shiftBusy, setShiftBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [gpsOk, setGpsOk] = useState<boolean | null>(null);
  const [form, setForm] = useState({ full_name: "", phone: "", vehicle_type: "bike" });
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [me, p] = await Promise.all([
        api<{ courier: Courier; shift?: Shift; earnings?: Earnings }>("/v1/courier/me"),
        api<{ items: Payout[] }>("/v1/courier/payouts"),
      ]);
      setCourier(me.courier);
      setShift(me.shift || null);
      setEarnings(me.earnings || null);
      setPayouts(p.items || []);
      setForm({
        full_name: me.courier.full_name || "",
        phone: me.courier.phone || "",
        vehicle_type: me.courier.vehicle_type || "bike",
      });
      setMsg("");
    } catch (e) {
      setMsg(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    if (!navigator.geolocation) {
      setGpsOk(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      () => setGpsOk(true),
      () => setGpsOk(false),
      { maximumAge: 60_000 }
    );
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const onShift = !!shift && shift.status === "open";
  const shiftDur = useMemo(
    () => formatShiftDuration(shift?.started_at, t),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shift?.started_at, t, tick]
  );

  async function toggleShift() {
    setShiftBusy(true);
    setMsg("");
    setOk("");
    try {
      if (onShift) await api("/v1/courier/shifts/close", { method: "POST", body: "{}" });
      else await api("/v1/courier/shifts/open", { method: "POST", body: "{}" });
      emitShiftChange(!onShift);
      await load();
      setOk(!onShift ? t("shiftOpenedOk") : t("shiftClosedOk"));
    } catch (e) {
      setMsg(errMsg(e));
    } finally {
      setShiftBusy(false);
    }
  }

  async function saveProfile() {
    setSaving(true);
    setMsg("");
    setOk("");
    try {
      const res = await api<{ courier: Courier }>("/v1/courier/me", {
        method: "PUT",
        body: JSON.stringify(form),
      });
      setCourier(res.courier);
      setEditing(false);
      setOk(t("profileSaved"));
    } catch (e) {
      setMsg(errMsg(e));
    } finally {
      setSaving(false);
    }
  }

  function payoutLabel(status: string) {
    const key = `payout_${status}`;
    const label = t(key);
    return label !== key ? label : status;
  }

  function vehicleLabel(v: string) {
    const key = `vehicle_${v}`;
    const label = t(key);
    return label !== key ? label : v;
  }

  const cur = earnings?.currency || "UZS";

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">{t("profileTitle")}</h1>
          <p className="mt-0.5 text-xs text-slate-500">{t("profileSubtitle")}</p>
        </div>
        <button type="button" className="text-xs font-semibold text-teal underline" onClick={() => load()}>
          {t("jobsRefresh")}
        </button>
      </div>

      <div className="mt-3">
        <Msg text={msg} onRetry={() => load()} retryLabel={t("commonRetry")} />
        <Msg text={ok} tone="ok" />
      </div>

      {loading && !courier ? <div className="mt-4 h-48 animate-pulse rounded-2xl bg-white/80" /> : null}

      {courier ? (
        <>
          <section className="mt-4 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
            <div className="bg-gradient-to-br from-night via-teal-800 to-teal px-4 py-5 text-white">
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-lg font-bold backdrop-blur">
                  {initials(courier.full_name)}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-display text-xl font-bold">{courier.full_name}</p>
                  {courier.email ? <p className="truncate text-xs text-white/75">{courier.email}</p> : null}
                  <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-saffron">
                    {courier.status === "active" ? t("profileActive") : courier.status}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-px bg-slate-100">
              <div className="bg-white px-3 py-3 text-center">
                <p className="text-[10px] font-bold uppercase text-slate-400">{t("profileRating")}</p>
                <p className="mt-0.5 text-lg font-bold text-night">{Number(courier.rating_avg || 0).toFixed(1)}</p>
                <p className="text-[10px] text-slate-400">{courier.rating_count}</p>
              </div>
              <div className="bg-white px-3 py-3 text-center">
                <p className="text-[10px] font-bold uppercase text-slate-400">{t("profileActiveJobs")}</p>
                <p className="mt-0.5 text-lg font-bold text-teal">{courier.active_jobs ?? 0}</p>
                <Link href="/jobs" className="text-[10px] font-semibold text-teal underline">
                  {t("navJobs")}
                </Link>
              </div>
              <div className="bg-white px-3 py-3 text-center">
                <p className="text-[10px] font-bold uppercase text-slate-400">{t("earnToday")}</p>
                <p className="mt-0.5 text-sm font-bold leading-tight text-night">
                  {money(earnings?.earned_today || 0, cur, numberLocale)}
                </p>
                <p className="text-[10px] text-slate-400">{t("earnTrips", { n: earnings?.completed_today || 0 })}</p>
              </div>
            </div>

            <div className="space-y-3 border-t px-4 py-4">
              <div className="rounded-xl bg-slate-50 px-3 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-bold uppercase text-slate-400">
                      {onShift ? t("shiftOn") : t("shiftOff")}
                    </p>
                    {onShift && shiftDur ? (
                      <p className="mt-0.5 text-xs text-slate-600">{t("shiftDuration", { duration: shiftDur })}</p>
                    ) : (
                      <p className="mt-0.5 text-xs text-slate-500">{t("shiftHintOff")}</p>
                    )}
                  </div>
                  <Button
                    variant={onShift ? "secondary" : "primary"}
                    className="!px-3 !py-2 text-xs"
                    disabled={shiftBusy}
                    onClick={toggleShift}
                  >
                    {onShift ? t("shiftClose") : t("shiftOpen")}
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="text-slate-500">{t("gpsShort")}</span>
                <span className={gpsOk ? "font-medium text-emerald-700" : "font-medium text-amber-700"}>
                  {gpsOk ? t("profileGpsOn") : t("profileGpsOff")}
                </span>
              </div>

              {!editing ? (
                <>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-500">{t("profilePhone")}</dt>
                      <dd>
                        <a className="font-medium text-teal" href={`tel:${courier.phone}`}>
                          {courier.phone || "—"}
                        </a>
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-500">{t("profileVehicle")}</dt>
                      <dd className="font-medium">{vehicleLabel(courier.vehicle_type)}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-slate-500">{t("earnUnpaid")}</dt>
                      <dd className="font-medium">{money(earnings?.earned_unpaid || 0, cur, numberLocale)}</dd>
                    </div>
                  </dl>
                  <Button variant="secondary" className="w-full !py-2.5 text-sm" onClick={() => setEditing(true)}>
                    {t("profileEdit")}
                  </Button>
                </>
              ) : (
                <div className="space-y-3">
                  <label className="block text-sm">
                    <span className="mb-1 block text-slate-500">{t("profileName")}</span>
                    <input
                      className="w-full rounded-xl border px-3 py-2.5 outline-none focus:border-teal"
                      value={form.full_name}
                      onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block text-slate-500">{t("profilePhone")}</span>
                    <input
                      className="w-full rounded-xl border px-3 py-2.5 outline-none focus:border-teal"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="mb-1 block text-slate-500">{t("profileVehicle")}</span>
                    <select
                      className="w-full rounded-xl border px-3 py-2.5 outline-none focus:border-teal"
                      value={form.vehicle_type}
                      onChange={(e) => setForm({ ...form, vehicle_type: e.target.value })}
                    >
                      {VEHICLES.map((v) => (
                        <option key={v} value={v}>
                          {vehicleLabel(v)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex gap-2">
                    <Button variant="secondary" className="flex-1 !py-2.5" onClick={() => setEditing(false)} disabled={saving}>
                      {t("jobCancel")}
                    </Button>
                    <Button variant="primary" className="flex-1 !py-2.5" onClick={saveProfile} disabled={saving}>
                      {saving ? t("authLoading") : t("profileSave")}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </section>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <Link
              href="/earnings"
              className="rounded-2xl border border-teal/20 bg-teal/5 p-4 transition hover:border-teal/40"
            >
              <p className="text-[10px] font-bold uppercase text-teal">{t("earnTitle")}</p>
              <p className="mt-1 text-sm font-semibold text-night">{t("profileOpenEarnings")}</p>
            </Link>
            <Link
              href="/jobs?tab=history"
              className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-teal/40"
            >
              <p className="text-[10px] font-bold uppercase text-slate-400">{t("jobsTabHistory")}</p>
              <p className="mt-1 text-sm font-semibold text-night">
                {t("earnTrips", { n: earnings?.completed_total || 0 })}
              </p>
            </Link>
          </div>
        </>
      ) : null}

      <h2 className="mt-6 font-semibold">{t("profilePayouts")}</h2>
      {payouts.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">{t("profileNoPayouts")}</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {payouts.slice(0, 5).map((p) => (
            <li key={p.id} className="rounded-xl border bg-white px-3 py-2 text-sm">
              <div className="flex justify-between gap-2">
                <span>
                  {p.period_start} → {p.period_end}
                </span>
                <strong>
                  {p.amount.toLocaleString(numberLocale)} {p.currency}
                </strong>
              </div>
              <p className="text-xs text-slate-500">{payoutLabel(p.status)}</p>
            </li>
          ))}
        </ul>
      )}

      <Button
        variant="secondary"
        className="mt-8 w-full !py-3"
        onClick={async () => {
          await logout();
          window.location.assign("/");
        }}
      >
        {t("logout")}
      </Button>
    </div>
  );
}
