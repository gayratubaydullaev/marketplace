"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Input } from "@gayrat/ui";
import { api, errMsg } from "@/lib/api";
import { EmptyState, Msg, PageHeader, Pagination, Select, StatusBadge, TableShell } from "@/components/ui";
import { useI18n } from "@/lib/i18n";

type Order = {
  id: string;
  order_number: string;
  status: string;
  payment_status?: string;
  total: number;
  created_at: string;
  user_id?: string;
};

const PAGE_SIZE = 20;

export default function OrdersPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<Order[]>([]);
  const [msg, setMsg] = useState("");
  const [status, setStatus] = useState("all");
  const [payment, setPayment] = useState("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    api<{ items: Order[] }>("/v1/orders")
      .then((d) => setItems(d.items || []))
      .catch((e) => setMsg(errMsg(e)));
  }, []);

  const filtered = useMemo(() => {
    return items.filter((o) => {
      if (status !== "all" && o.status !== status) return false;
      if (payment !== "all" && (o.payment_status || "") !== payment) return false;
      const needle = q.trim().toLowerCase();
      if (needle && !o.order_number?.toLowerCase().includes(needle) && !o.id.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [items, status, payment, q]);

  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <PageHeader title={t("pageOrdersTitle")} description={t("pageOrdersDesc")} />
      <div className="mb-4 flex flex-wrap gap-2">
        <Input
          className="max-w-xs"
          placeholder="Order number"
          value={q}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          {["all", "pending", "confirmed", "processing", "shipped", "delivered", "completed", "cancelled", "returned"].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <Select
          value={payment}
          onChange={(e) => {
            setPayment(e.target.value);
            setPage(1);
          }}
        >
          {["all", "unpaid", "paid", "refunded"].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </div>
      <Msg text={msg} />
      {pageItems.length === 0 ? (
        <EmptyState text="No orders" />
      ) : (
        <TableShell>
          <thead>
            <tr className="border-b bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Number</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Payment</th>
              <th className="px-4 py-3">Total</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((o) => (
              <tr key={o.id} className="border-b last:border-0 hover:bg-slate-50/60">
                <td className="px-4 py-3">
                  <Link href={`/orders/${o.id}`} className="font-mono font-medium text-teal hover:underline">
                    {o.order_number}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={o.status} />
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={o.payment_status} />
                </td>
                <td className="px-4 py-3">{o.total?.toLocaleString()} UZS</td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
      <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} />
    </div>
  );
}
