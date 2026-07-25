"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@gayrat/ui";
import { api, errMsg } from "@/lib/api";
import { MapNavLinks } from "@gayrat/map/nav";
import { useI18n } from "@/lib/i18n";
import { StatusBadge } from "@/components/StatusBadge";
import { Msg } from "@/components/ui";
import { usePoll } from "@/hooks/usePoll";
import { JOB_STEPS, money, stepIndex } from "@/lib/status";
import "@gayrat/map/styles.css";

const RouteMap = dynamic(() => import("@gayrat/map").then((m) => m.RouteMap), {
  ssr: false,
  loading: () => <div className="gayrat-map-skeleton h-[280px] rounded-2xl" />,
});

type Job = {
  id: string;
  status: string;
  order_number?: string;
  pickup_address: string;
  dropoff_address: string;
  pickup_lat?: number | null;
  pickup_lng?: number | null;
  dropoff_lat?: number | null;
  dropoff_lng?: number | null;
  customer_name?: string;
  customer_phone?: string;
  cod_amount: number;
  currency?: string;
  payment_status?: string;
};

type Msg = { id: string; sender_role: string; to_role?: string; body: string; created_at: string };

const NEXT: Record<string, { action: string; labelKey: string }[]> = {
  assigned: [{ action: "accept", labelKey: "jobAccept" }],
  accepted: [{ action: "arrive-pickup", labelKey: "jobArrive" }],
  at_pickup: [{ action: "picked-up", labelKey: "jobPicked" }],
  picked_up: [{ action: "in-transit", labelKey: "jobTransit" }],
  in_transit: [{ action: "delivered", labelKey: "jobDelivered" }],
};

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t, locale } = useI18n();
  const numberLocale = locale === "uz" ? "uz-UZ" : locale === "en" ? "en-US" : "ru-RU";
  const [job, setJob] = useState<Job | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [body, setBody] = useState("");
  const [toRole, setToRole] = useState<"customer" | "vendor">("customer");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<"cod" | "delivered" | null>(null);
  const [self, setSelf] = useState<{ lat: number; lng: number } | null>(null);

  const load = useCallback(async () => {
    const [j, m] = await Promise.all([
      api<Job>(`/v1/courier/jobs/${id}`),
      api<{ items: Msg[] }>(`/v1/courier/jobs/${id}/messages?thread=${toRole}`),
    ]);
    setJob(j);
    setMessages(m.items || []);
  }, [id, toRole]);

  useEffect(() => {
    load().catch((e) => setErr(errMsg(e)));
  }, [load]);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setSelf({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 30_000 }
    );
  }, []);

  usePoll(() => {
    load().catch(() => {});
  }, 8000, !!id);

  const needsCod =
    !!job &&
    job.cod_amount > 0 &&
    job.payment_status !== "paid" &&
    (job.status === "in_transit" || job.status === "picked_up");
  const codPaid = !!job && job.cod_amount > 0 && job.payment_status === "paid";

  async function act(action: string) {
    if (action === "delivered") {
      if (needsCod) {
        setErr(t("jobCodCollectFirst"));
        return;
      }
      setConfirm("delivered");
      return;
    }
    setBusy(true);
    setErr("");
    setOk("");
    try {
      await api(`/v1/courier/jobs/${id}/${action}`, { method: "POST", body: "{}" });
      await load();
    } catch (e) {
      const raw = errMsg(e);
      setErr(raw.toLowerCase().includes("payment") ? t("jobCodCollectFirst") : raw);
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelivered() {
    setConfirm(null);
    setBusy(true);
    setErr("");
    try {
      await api(`/v1/courier/jobs/${id}/delivered`, { method: "POST", body: "{}" });
      await load();
      setOk(t("status_delivered"));
    } catch (e) {
      const raw = errMsg(e);
      setErr(raw.toLowerCase().includes("payment") ? t("jobCodCollectFirst") : raw);
    } finally {
      setBusy(false);
    }
  }

  async function collectCod() {
    setConfirm("cod");
  }

  async function confirmCod() {
    setConfirm(null);
    setBusy(true);
    setErr("");
    setOk("");
    try {
      await api(`/v1/courier/jobs/${id}/collect-cod`, { method: "POST", body: "{}" });
      await load();
      setOk(t("jobCodCollected"));
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!body.trim()) return;
    setBusy(true);
    try {
      await api(`/v1/courier/jobs/${id}/messages`, {
        method: "POST",
        body: JSON.stringify({ body, to_role: toRole }),
      });
      setBody("");
      await load();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  function roleName(role: string) {
    const key = `chatRole_${role === "admin" || role === "manager" || role === "super_admin" ? "tenant_admin" : role}`;
    const label = t(key);
    return label !== key ? label : role;
  }

  const mapStops = useMemo(() => {
    if (!job) return [];
    const stops: { id: string; lat: number; lng: number; label: string; kind: "pickup" | "dropoff" }[] = [];
    if (job.pickup_lat != null && job.pickup_lng != null) {
      stops.push({
        id: "pickup",
        lat: job.pickup_lat,
        lng: job.pickup_lng,
        label: job.pickup_address || t("jobPickup"),
        kind: "pickup",
      });
    }
    if (job.dropoff_lat != null && job.dropoff_lng != null) {
      stops.push({
        id: "dropoff",
        lat: job.dropoff_lat,
        lng: job.dropoff_lng,
        label: job.dropoff_address || t("jobDropoff"),
        kind: "dropoff",
      });
    }
    return stops;
  }, [job, t]);

  if (!job && !err) {
    return (
      <div className="space-y-3">
        <div className="h-8 w-40 animate-pulse rounded-lg bg-white/80" />
        <div className="h-52 animate-pulse rounded-2xl bg-white/80" />
        <div className="h-40 animate-pulse rounded-2xl bg-white/80" />
      </div>
    );
  }
  if (!job) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-700">
        <p>{err}</p>
        <Link href="/jobs" className="mt-2 inline-block font-semibold text-teal underline">
          ← {t("navJobs")}
        </Link>
      </div>
    );
  }

  const actions = NEXT[job.status] || [];
  const primary = actions[0];
  const atDrop = ["picked_up", "in_transit"].includes(job.status);
  const navLat = atDrop ? job.dropoff_lat : job.pickup_lat;
  const navLng = atDrop ? job.dropoff_lng : job.pickup_lng;
  const navAddr = atDrop ? job.dropoff_address : job.pickup_address;
  const hasActiveNav =
    (navLat != null && navLng != null) || Boolean(navAddr?.trim());
  const curStep = stepIndex(job.status);
  const codLabel = money(job.cod_amount, job.currency || "UZS", numberLocale);

  return (
    <div className="pb-28">
      <Link href="/jobs" className="text-sm text-teal hover:underline">
        ← {t("navJobs")}
      </Link>
      <div className="mt-2 flex items-start justify-between gap-3">
        <h1 className="font-display text-2xl font-bold">{job.order_number || job.id.slice(0, 8)}</h1>
        <StatusBadge status={job.status} />
      </div>

      <div className="mt-3">
        <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">{t("jobStepProgress")}</p>
        <div className="flex gap-1">
          {JOB_STEPS.map((s, i) => (
            <div
              key={s}
              title={t(`status_${s}`)}
              className={`h-1.5 flex-1 rounded-full ${i <= curStep ? "bg-teal" : "bg-slate-200"}`}
            />
          ))}
        </div>
      </div>

      <Msg text={err} onRetry={() => load().catch((e) => setErr(errMsg(e)))} retryLabel={t("commonRetry")} />
      <Msg text={ok} tone="ok" />

      {mapStops.length > 0 ? (
        <div className="mt-4 overflow-hidden rounded-2xl border bg-white shadow-sm">
          <RouteMap
            stops={mapStops}
            self={self}
            height={280}
            showRoute
            legend={[
              { color: "#0d7377", label: t("jobPickup") },
              { color: "#e8a838", label: t("jobDropoff") },
              ...(self ? [{ color: "#2563eb", label: t("gpsShort") }] : []),
            ]}
          />
        </div>
      ) : null}

      <section className="mt-4 space-y-4 rounded-2xl border bg-white p-4">
        <AddressBlock label={t("jobPickup")} address={job.pickup_address} highlight={!atDrop} />
        <AddressBlock
          label={t("jobDropoff")}
          address={job.dropoff_address}
          highlight={atDrop}
          name={job.customer_name}
          phone={job.customer_phone}
          callLabel={t("jobCall")}
        />
        {job.cod_amount > 0 ? (
          <div
            className={`rounded-xl px-3 py-2.5 text-sm font-semibold ${
              codPaid ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"
            }`}
          >
            {t("jobCod")}: {codLabel}
            {codPaid ? ` · ${t("jobCodCollected")}` : null}
          </div>
        ) : null}

        {hasActiveNav ? (
          <div>
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
              {t("jobNavigateTo")} · {atDrop ? t("jobDropoff") : t("jobPickup")}
            </p>
            <MapNavLinks
              lat={navLat}
              lng={navLng}
              address={navAddr}
              from={self}
              labels={{
                yandexNavi: t("jobMapsYandexNavi"),
                yandex: t("jobMapsYandex"),
                google: t("jobMapsGoogle"),
              }}
            />
          </div>
        ) : null}
      </section>

      <section className="mt-6">
        <h2 className="font-semibold">{t("jobChat")}</h2>
        <p className="mt-0.5 text-[11px] text-slate-500">{t("jobChatHint")}</p>
        <div className="mt-2 flex rounded-xl bg-slate-100/80 p-1">
          {(
            [
              ["customer", "chatRole_customer"],
              ["vendor", "chatRole_vendor"],
            ] as const
          ).map(([value, labelKey]) => (
            <button
              key={value}
              type="button"
              onClick={() => setToRole(value)}
              className={`flex-1 rounded-lg py-2 text-xs font-bold uppercase tracking-wide transition ${
                toRole === value ? "bg-white text-teal shadow-sm" : "text-slate-500"
              }`}
            >
              {t(labelKey)}
            </button>
          ))}
        </div>
        <div className="mt-2 max-h-56 space-y-2 overflow-y-auto rounded-2xl border bg-white p-3">
          {messages.length === 0 ? <p className="text-xs text-slate-400">{t("jobChatEmpty")}</p> : null}
          {messages.map((m) => {
            const mine = m.sender_role === "courier";
            return (
              <div key={m.id} className={`text-sm ${mine ? "text-right" : ""}`}>
                <span
                  className={`inline-block max-w-[90%] rounded-2xl px-3 py-1.5 text-left ${
                    mine ? "bg-teal/15 text-night" : "bg-slate-100"
                  }`}
                >
                  {m.body}
                </span>
                <p className="mt-0.5 text-[10px] text-slate-400">{roleName(m.sender_role)}</p>
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            className="flex-1 rounded-xl border px-3 py-2.5 text-sm outline-none focus:border-teal"
            placeholder={t("chatPlaceholderTo", { to: roleName(toRole) })}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
          />
          <Button variant="primary" className="!px-3 !py-2.5 text-xs" disabled={busy} onClick={send}>
            {t("send")}
          </Button>
        </div>
      </section>

      {(primary || needsCod) && job.status !== "delivered" ? (
        <div className="fixed bottom-[4.25rem] left-0 right-0 z-30 px-4 pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto flex max-w-lg flex-col gap-2 rounded-2xl border border-slate-200/80 bg-white/95 p-3 shadow-lg backdrop-blur">
            {needsCod ? (
              <Button variant="secondary" className="w-full !py-3 text-sm" disabled={busy} onClick={collectCod}>
                {t("jobCollectCod")} · {codLabel}
              </Button>
            ) : null}
            {primary ? (
              <Button
                variant="primary"
                className="w-full !py-3.5 text-sm font-bold"
                disabled={busy || (primary.action === "delivered" && needsCod)}
                onClick={() => act(primary.action)}
              >
                {t(primary.labelKey)}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {confirm ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-night/40 p-4 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <p className="text-sm font-medium text-night">
              {confirm === "cod"
                ? t("jobCodConfirm", { amount: codLabel })
                : t("jobDeliverConfirm")}
            </p>
            <div className="mt-4 flex gap-2">
              <Button variant="secondary" className="flex-1 !py-2.5" onClick={() => setConfirm(null)}>
                {t("jobCancel")}
              </Button>
              <Button
                variant="primary"
                className="flex-1 !py-2.5"
                disabled={busy}
                onClick={() => (confirm === "cod" ? confirmCod() : confirmDelivered())}
              >
                {t("jobOk")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AddressBlock({
  label,
  address,
  highlight,
  name,
  phone,
  callLabel,
}: {
  label: string;
  address?: string;
  highlight?: boolean;
  name?: string;
  phone?: string;
  callLabel?: string;
}) {
  return (
    <div className={highlight ? "rounded-xl bg-teal/5 p-3 ring-1 ring-teal/20" : ""}>
      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-sm">{address || "—"}</p>
      {name ? <p className="mt-1 text-sm font-medium">{name}</p> : null}
      {phone ? (
        <a className="mt-1 inline-flex text-sm font-semibold text-teal" href={`tel:${phone}`}>
          {callLabel ? `${callLabel} · ${phone}` : phone}
        </a>
      ) : null}
    </div>
  );
}
