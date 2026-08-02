"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, errMsg } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { StatusBadge } from "@/components/StatusBadge";
import { EmptyState, KpiCard, Msg } from "@/components/ui";
import { usePoll } from "@/hooks/usePoll";
import { money } from "@/lib/status";

type Summary = {
  currency: string;
  completed_today: number;
  completed_week: number;
  completed_month: number;
  completed_total: number;
  earned_today: number;
  earned_week: number;
  earned_month: number;
  earned_unpaid: number;
  payout_pending: number;
  payout_paid: number;
  default_fee: number;
};

type Payout = {
  id: string;
  amount: number;
  status: string;
  period_start: string;
  period_end: string;
  currency: string;
};

type Job = {
  id: string;
  order_number?: string;
  status: string;
  delivery_fee: number;
  currency?: string;
  delivered_at?: string;
  dropoff_address?: string;
};

export default function EarningsPage() {
  const { t, locale } = useI18n();
  const numberLocale = locale === "uz" ? "uz-UZ" : locale === "en" ? "en-US" : "ru-RU";
  const [summary, setSummary] = useState<Summary | null>(null);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [recent, setRecent] = useState<Job[]>([]);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (soft = false) => {
    if (!soft) setLoading(true);
    try {
      const data = await api<{ summary: Summary; payouts: Payout[]; recent_jobs: Job[] }>("/v1/courier/earnings");
      setSummary(data.summary);
      setPayouts(data.payouts || []);
      setRecent(data.recent_jobs || []);
      setMsg("");
    } catch (e) {
      setMsg(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  usePoll(() => load(true), 60_000, true);

  function payoutLabel(status: string) {
    const key = `payout_${status}`;
    const label = t(key);
    return label !== key ? label : status;
  }

  const cur = summary?.currency || "UZS";
  const feeHint = summary?.default_fee || 15000;

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">{t("earnTitle")}</h1>
          <p className="mt-0.5 text-xs text-slate-500">{t("earnHint", { fee: money(feeHint, cur, numberLocale) })}</p>
        </div>
        <button type="button" className="text-xs font-semibold text-teal underline" onClick={() => load()} disabled={loading}>
          {t("jobsRefresh")}
        </button>
      </div>

      <div className="mt-3">
        <Msg text={msg} onRetry={() => load()} retryLabel={t("commonRetry")} />
      </div>

      {loading && !summary ? (
        <div className="mt-4 grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-white/80" />
          ))}
        </div>
      ) : null}

      {summary ? (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <KpiCard
            label={t("earnToday")}
            value={money(summary.earned_today, cur, numberLocale)}
            hint={t("earnTrips", { n: summary.completed_today })}
          />
          <KpiCard
            label={t("earnWeek")}
            value={money(summary.earned_week, cur, numberLocale)}
            hint={t("earnTrips", { n: summary.completed_week })}
          />
          <KpiCard
            label={t("earnMonth")}
            value={money(summary.earned_month, cur, numberLocale)}
            hint={t("earnTrips", { n: summary.completed_month })}
          />
          <KpiCard
            label={t("earnUnpaid")}
            value={money(summary.earned_unpaid, cur, numberLocale)}
            hint={t("earnUnpaidHint")}
          />
        </div>
      ) : null}

      {summary ? (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <KpiCard label={t("earnPayoutPending")} value={money(summary.payout_pending, cur, numberLocale)} />
          <KpiCard label={t("earnPayoutPaid")} value={money(summary.payout_paid, cur, numberLocale)} />
        </div>
      ) : null}

      <div className="mt-6 flex items-center justify-between gap-2">
        <h2 className="font-semibold">{t("earnHistory")}</h2>
        <Link href="/jobs?tab=history" className="text-xs font-semibold text-teal underline">
          {t("earnAllHistory")}
        </Link>
      </div>
      {recent.length === 0 && !loading ? (
        <div className="mt-2">
          <EmptyState text={t("earnNoHistory")} />
        </div>
      ) : null}
      {recent.length > 0 ? (
        <ul className="mt-2 space-y-2">
          {recent.map((j) => {
            const fee = j.delivery_fee > 0 ? j.delivery_fee : feeHint;
            return (
              <li key={j.id}>
                <Link href={`/jobs/${j.id}`} className="flex items-center justify-between gap-3 rounded-xl border bg-white px-3 py-2.5 text-sm transition hover:border-teal/40">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{j.order_number || j.id.slice(0, 8)}</p>
                    <p className="truncate text-[11px] text-slate-500">{j.dropoff_address || "—"}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-bold text-teal">{money(fee, j.currency || cur, numberLocale)}</p>
                    <StatusBadge status={j.status} />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}

      <h2 className="mt-6 font-semibold">{t("profilePayouts")}</h2>
      {payouts.length === 0 && !loading ? (
        <div className="mt-2">
          <EmptyState text={t("profileNoPayouts")} />
        </div>
      ) : null}
      {payouts.length > 0 ? (
        <ul className="mt-2 space-y-2">
          {payouts.map((p) => (
            <li key={p.id} className="rounded-xl border bg-white px-3 py-2 text-sm">
              <div className="flex justify-between gap-2">
                <span>
                  {p.period_start} → {p.period_end}
                </span>
                <strong>{money(p.amount, p.currency || cur, numberLocale)}</strong>
              </div>
              <p className="text-xs text-slate-500">{payoutLabel(p.status)}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
