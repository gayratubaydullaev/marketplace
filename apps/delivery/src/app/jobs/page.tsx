"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@gayrat/ui";
import { api, errMsg } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState, Msg } from "@/components/ui";
import { usePoll } from "@/hooks/usePoll";
import { emitShiftChange, money } from "@/lib/status";

type Job = {
  id: string;
  status: string;
  order_number?: string;
  pickup_address: string;
  dropoff_address: string;
  cod_amount: number;
  currency?: string;
  delivery_fee?: number;
  sequence: number;
  delivered_at?: string;
};

type Tab = "active" | "history";

function JobsInner() {
  const { t, locale } = useI18n();
  const search = useSearchParams();
  const router = useRouter();
  const numberLocale = locale === "uz" ? "uz-UZ" : locale === "en" ? "en-US" : "ru-RU";
  const [tab, setTab] = useState<Tab>(() => (search.get("tab") === "history" ? "history" : "active"));
  const [jobs, setJobs] = useState<Job[]>([]);
  const [onShift, setOnShift] = useState(false);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [shiftBusy, setShiftBusy] = useState(false);

  useEffect(() => {
    const next = search.get("tab") === "history" ? "history" : "active";
    setTab(next);
  }, [search]);

  function switchTab(next: Tab) {
    setTab(next);
    router.replace(next === "history" ? "/jobs?tab=history" : "/jobs");
  }

  const load = useCallback(
    async (soft = false) => {
      if (!soft) setLoading(true);
      try {
        const scope = tab === "history" ? "history" : "active";
        const [me, list] = await Promise.all([
          api<{ shift?: { status?: string } | null }>("/v1/courier/me"),
          api<{ items: Job[] }>(`/v1/courier/jobs?scope=${scope}`),
        ]);
        const open = !!me.shift && me.shift.status === "open";
        setOnShift(open);
        emitShiftChange(open);
        setJobs(list.items || []);
        setMsg("");
      } catch (e) {
        setMsg(errMsg(e));
      } finally {
        setLoading(false);
      }
    },
    [tab]
  );

  useEffect(() => {
    void load();
  }, [load]);

  usePoll(() => load(true), 20_000, tab === "active");

  async function toggleShift() {
    setMsg("");
    setShiftBusy(true);
    try {
      if (onShift) await api("/v1/courier/shifts/close", { method: "POST", body: "{}" });
      else await api("/v1/courier/shifts/open", { method: "POST", body: "{}" });
      await load();
    } catch (e) {
      setMsg(errMsg(e));
    } finally {
      setShiftBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">{t("jobsTitle")}</h1>
          {!loading ? (
            <p className="mt-0.5 text-xs text-slate-500">
              {tab === "history" ? t("jobsHistoryCount", { n: jobs.length }) : t("jobsCount", { n: jobs.length })}
            </p>
          ) : null}
        </div>
        <Button variant="secondary" className="!px-3 !py-2 text-xs" onClick={() => load()} disabled={loading}>
          {t("jobsRefresh")}
        </Button>
      </div>

      <div className="mb-4 flex rounded-xl bg-slate-100/80 p-1">
        {(["active", "history"] as Tab[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => switchTab(k)}
            className={`flex-1 rounded-lg py-2 text-xs font-bold uppercase tracking-wide transition ${
              tab === k ? "bg-white text-teal shadow-sm" : "text-slate-500"
            }`}
          >
            {k === "active" ? t("jobsTabActive") : t("jobsTabHistory")}
          </button>
        ))}
      </div>

        <Msg text={msg} onRetry={() => load()} retryLabel={t("commonRetry")} />

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-white/80 ring-1 ring-slate-100" />
          ))}
        </div>
      ) : null}

      {!loading && jobs.length === 0 ? (
        <EmptyState
          text={tab === "history" ? t("earnNoHistory") : onShift ? t("jobsEmpty") : t("jobsEmptyOffShift")}
          action={
            tab === "active" && !onShift ? (
              <Button variant="primary" className="mt-4 !px-4 !py-2.5 text-sm" disabled={shiftBusy} onClick={toggleShift}>
                {t("shiftOpen")}
              </Button>
            ) : tab === "history" ? (
              <Link href="/earnings" className="mt-4 inline-block text-sm font-semibold text-teal underline">
                {t("earnTitle")}
              </Link>
            ) : null
          }
        />
      ) : null}

      {!loading && jobs.length > 0 ? (
        <ul className="space-y-3">
          {jobs.map((j, idx) => {
            const useDrop = tab === "history" || ["picked_up", "in_transit"].includes(j.status);
            const fee = j.delivery_fee && j.delivery_fee > 0 ? j.delivery_fee : 15000;
            return (
              <li key={j.id}>
                <Link
                  href={`/jobs/${j.id}`}
                  className="block rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:border-teal/40 active:scale-[0.99]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      {tab === "active" ? (
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-night text-xs font-bold text-white">
                          {j.sequence || idx + 1}
                        </span>
                      ) : null}
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{j.order_number || j.id.slice(0, 8)}</p>
                        {tab === "active" && idx === 0 ? (
                          <p className="text-[10px] font-bold uppercase tracking-wide text-saffron">{t("jobsNext")}</p>
                        ) : null}
                      </div>
                    </div>
                    <StatusBadge status={j.status} />
                  </div>
                  {tab === "active" ? (
                    <div className="mt-3 space-y-1 text-xs text-slate-500">
                      <p>
                        <span className="font-semibold text-slate-600">{t("jobPickup")}:</span> {j.pickup_address || "—"}
                      </p>
                      <p>
                        <span className="font-semibold text-slate-600">{t("jobDropoff")}:</span> {j.dropoff_address || "—"}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-slate-500">
                      <span className="font-semibold text-slate-600">{useDrop ? t("jobDropoff") : t("jobPickup")}:</span>{" "}
                      {(useDrop ? j.dropoff_address : j.pickup_address) || "—"}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {j.cod_amount > 0 && tab === "active" ? (
                      <span className="inline-flex rounded-lg bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-900">
                        {t("jobCod")}: {money(j.cod_amount, j.currency || "UZS", numberLocale)}
                      </span>
                    ) : null}
                    {tab === "history" ? (
                      <span className="inline-flex rounded-lg bg-teal/10 px-2 py-1 text-xs font-semibold text-teal">
                        +{money(fee, j.currency || "UZS", numberLocale)}
                      </span>
                    ) : null}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

export default function JobsPage() {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-white/80" />}>
      <JobsInner />
    </Suspense>
  );
}
