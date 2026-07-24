"use client";

import { useEffect, useState } from "react";
import { Button } from "@gayrat/ui";
import { EmptyState, Msg, PageHeader, StatusBadge, TableShell } from "@/components/ui";
import { api, errMsg } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

type ReturnRequest = {
  id: string;
  order_id?: string;
  order_number?: string;
  customer_name?: string;
  reason?: string;
  status: string;
  amount?: number;
  created_at?: string;
};

const ACTIONS = ["approve", "reject", "receive", "refund"] as const;

export default function ReturnsPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<ReturnRequest[]>([]);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState("");

  async function load() {
    const data = await api<{ items: ReturnRequest[] }>("/v1/admin/returns");
    setItems(data.items || []);
  }

  useEffect(() => {
    load().catch((e) => setMsg(errMsg(e)));
  }, []);

  async function action(id: string, value: (typeof ACTIONS)[number]) {
    setMsg("");
    await api(`/v1/admin/returns/${id}/${value}`, { method: "POST", body: "{}" });
    setOk(`Return ${value}d`);
    await load();
  }

  return (
    <div>
      <PageHeader title={t("pageReturnsTitle")} description={t("pageReturnsDesc")} />
      <Msg text={msg} />
      <Msg text={ok} tone="ok" />
      {items.length === 0 ? <EmptyState text="No return requests" /> : (
        <TableShell>
          <thead>
            <tr className="border-b bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Reason</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b last:border-0 hover:bg-slate-50/60">
                <td className="px-4 py-3">{item.order_number || item.order_id || "—"}</td>
                <td className="px-4 py-3">{item.customer_name || "—"}</td>
                <td className="px-4 py-3">{item.reason || "—"}</td>
                <td className="px-4 py-3">{item.amount?.toLocaleString() || "—"} UZS</td>
                <td className="px-4 py-3"><StatusBadge status={item.status} /></td>
                <td className="space-x-2 whitespace-nowrap px-4 py-3">
                  {ACTIONS.map((value) => <Button key={value} variant={value === "reject" ? "ghost" : "secondary"} className={value === "reject" ? "!px-2 !py-1 text-xs text-rose-700" : "!px-2 !py-1 text-xs"} onClick={() => action(item.id, value).catch((e) => setMsg(errMsg(e)))}>{value}</Button>)}
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
    </div>
  );
}
