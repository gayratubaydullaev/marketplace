"use client";

import { useEffect, useState } from "react";
import { api, errMsg } from "@/lib/api";
import { EmptyState, Msg, PageHeader, StatusBadge, TableShell } from "@/components/ui";
import { useI18n } from "@/lib/i18n";

type Payout = {
  id: string;
  amount: number;
  commission_total: number;
  currency?: string;
  status?: string;
  period_start?: string;
  period_end?: string;
  created_at?: string;
};

type Overview = { revenue?: number; commission?: number; currency?: string };

export default function PayoutsPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<Payout[]>([]);
  const [summary, setSummary] = useState<Overview>({});
  const [msg, setMsg] = useState("");

  useEffect(() => {
    Promise.all([
      api<{ items: Payout[] }>("/v1/vendor/payouts").catch(() => ({ items: [] as Payout[] })),
      api<Overview>("/v1/analytics/vendor/overview").catch(() => ({})),
    ])
      .then(([payouts, overview]) => {
        setItems(payouts.items || []);
        setSummary(overview || {});
      })
      .catch((e) => setMsg(errMsg(e)));
  }, []);

  return (
    <div>
      <PageHeader title={t("pagePayoutsTitle")} description={t("pagePayoutsDesc")} />
      <Msg text={msg} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Net revenue</p>
          <p className="mt-2 font-display text-2xl font-bold text-teal">
            {(summary.revenue ?? 0).toLocaleString("ru-RU")} {summary.currency || "UZS"}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Commission paid</p>
          <p className="mt-2 font-display text-2xl font-bold">
            {(summary.commission ?? 0).toLocaleString("ru-RU")} {summary.currency || "UZS"}
          </p>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState text="Выплат пока нет. Admin запускает payout batch." />
      ) : (
        <TableShell>
          <thead>
            <tr className="border-b bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Commission</th>
              <th className="px-4 py-3">Period</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id} className="border-b last:border-0">
                <td className="px-4 py-3 font-semibold">
                  {Number(p.amount).toLocaleString("ru-RU")} {p.currency || "UZS"}
                </td>
                <td className="px-4 py-3">{Number(p.commission_total).toLocaleString("ru-RU")}</td>
                <td className="px-4 py-3 text-sm text-slate-500">
                  {String(p.period_start || "").slice(0, 10)} → {String(p.period_end || "").slice(0, 10)}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={p.status || "pending"} />
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
    </div>
  );
}
