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

type Balance = {
  pending?: number;
  available?: number;
  paid_total?: number;
  currency?: string;
};

export default function PayoutsPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<Payout[]>([]);
  const [balance, setBalance] = useState<Balance>({});
  const [msg, setMsg] = useState("");

  useEffect(() => {
    Promise.all([
      api<{ items: Payout[] }>("/v1/vendor/payouts").catch(() => ({ items: [] as Payout[] })),
      api<Balance>("/v1/vendor/balance").catch(() => ({})),
    ])
      .then(([payouts, bal]) => {
        setItems(payouts.items || []);
        setBalance(bal || {});
      })
      .catch((e) => setMsg(errMsg(e)));
  }, []);

  const currency = balance.currency || "UZS";
  const fmt = (n: number) => Number(n).toLocaleString("ru-RU");

  return (
    <div>
      <PageHeader title={t("pagePayoutsTitle")} description={t("pagePayoutsDesc")} />
      <Msg text={msg} />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Pending earnings</p>
          <p className="mt-2 font-display text-2xl font-bold text-amber-700">
            {fmt(balance.pending ?? 0)} {currency}
          </p>
          <p className="mt-1 text-xs text-slate-400">From paid orders, not yet batched</p>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">In payout pipeline</p>
          <p className="mt-2 font-display text-2xl font-bold text-teal">
            {fmt(balance.available ?? 0)} {currency}
          </p>
          <p className="mt-1 text-xs text-slate-400">Queued or processing payouts</p>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Paid out (total)</p>
          <p className="mt-2 font-display text-2xl font-bold">
            {fmt(balance.paid_total ?? 0)} {currency}
          </p>
          <p className="mt-1 text-xs text-slate-400">Completed payouts</p>
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
                  {fmt(Number(p.amount))} {p.currency || currency}
                </td>
                <td className="px-4 py-3">{fmt(Number(p.commission_total))}</td>
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
