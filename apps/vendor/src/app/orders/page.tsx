"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Input } from "@gayrat/ui";
import { api, errMsg } from "@/lib/api";
import { EmptyState, Msg, PageHeader, Pagination, Select, StatusBadge, TableShell } from "@/components/ui";
import { useI18n } from "@/lib/i18n";

type OrderRow = {
  order_id: string;
  title?: string;
  quantity?: number;
  total_price?: number;
  status?: string;
  created_at?: string;
};

type Aggregated = {
  order_id: string;
  titles: string[];
  qty: number;
  total: number;
  status: string;
  created_at?: string;
};

const PAGE_SIZE = 20;

export default function VendorOrders() {
  const { t } = useI18n();
  const [items, setItems] = useState<OrderRow[]>([]);
  const [msg, setMsg] = useState("");
  const [status, setStatus] = useState("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    api<{ items: OrderRow[] }>("/v1/vendor/orders")
      .then((d) => setItems(d.items || []))
      .catch((e) => setMsg(errMsg(e)));
  }, []);

  const aggregated = useMemo(() => {
    const map = new Map<string, Aggregated>();
    for (const row of items) {
      const id = String(row.order_id);
      const cur = map.get(id) || {
        order_id: id,
        titles: [],
        qty: 0,
        total: 0,
        status: row.status || "—",
        created_at: row.created_at,
      };
      if (row.title) cur.titles.push(row.title);
      cur.qty += Number(row.quantity || 0);
      cur.total += Number(row.total_price || 0);
      if (row.status) cur.status = row.status;
      map.set(id, cur);
    }
    return Array.from(map.values());
  }, [items]);

  const filtered = useMemo(() => {
    return aggregated.filter((o) => {
      if (status !== "all" && o.status !== status) return false;
      const needle = q.trim().toLowerCase();
      if (needle && !o.order_id.toLowerCase().includes(needle) && !o.titles.join(" ").toLowerCase().includes(needle)) {
        return false;
      }
      return true;
    });
  }, [aggregated, status, q]);

  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <PageHeader title={t("pageOrdersTitle")} description={t("pageOrdersDesc")} />
      <div className="mb-4 flex flex-wrap gap-2">
        <Input
          className="max-w-xs"
          placeholder="Order id / item"
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
          {["all", "pending", "confirmed", "processing", "shipped", "delivered", "cancelled"].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </div>
      <Msg text={msg} />
      {pageItems.length === 0 ? (
        <EmptyState text="Нет заказов" />
      ) : (
        <TableShell>
          <thead>
            <tr className="border-b bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Items</th>
              <th className="px-4 py-3">Qty</th>
              <th className="px-4 py-3">Total</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((o) => (
              <tr key={o.order_id} className="border-b last:border-0 hover:bg-slate-50/60">
                <td className="px-4 py-3">
                  <Link href={`/orders/${o.order_id}`} className="font-mono text-xs font-medium text-teal hover:underline">
                    {o.order_id.slice(0, 8)}…
                  </Link>
                </td>
                <td className="max-w-xs truncate px-4 py-3">{o.titles.join(", ") || "—"}</td>
                <td className="px-4 py-3">{o.qty}</td>
                <td className="px-4 py-3">{o.total.toLocaleString()} UZS</td>
                <td className="px-4 py-3">
                  <StatusBadge status={o.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
      <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} />
    </div>
  );
}
