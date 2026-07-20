"use client";

import { useEffect, useState } from "react";
import { api, errMsg } from "@/lib/api";
import { EmptyState, Msg, PageHeader, TableShell } from "@/components/ui";
import { useI18n } from "@/lib/i18n";

type Overview = {
  revenue?: number;
  commission?: number;
  orders?: number;
  currency?: string;
  top_products?: { product_id?: string; title?: string; sold?: number; revenue?: number }[];
};

export default function VendorAnalytics() {
  const { t } = useI18n();
  const [data, setData] = useState<Overview>({});
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api<Overview>("/v1/analytics/vendor/overview")
      .then(setData)
      .catch(() =>
        api<Overview>("/v1/vendor/dashboard/stats")
          .then(setData)
          .catch((e) => setMsg(errMsg(e)))
      );
  }, []);

  const top = data.top_products || [];

  return (
    <div>
      <PageHeader title={t("pageAnalyticsTitle")} description={t("pageAnalyticsDesc")} />
      <Msg text={msg} />
      <div className="mt-2 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Revenue</p>
          <p className="mt-2 font-display text-2xl font-bold text-teal">
            {(data.revenue ?? 0).toLocaleString("ru-RU")} {data.currency || "UZS"}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Commission</p>
          <p className="mt-2 font-display text-2xl font-bold">{(data.commission ?? 0).toLocaleString("ru-RU")}</p>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Orders</p>
          <p className="mt-2 font-display text-2xl font-bold">{data.orders ?? 0}</p>
        </div>
      </div>

      <h2 className="mt-8 font-semibold">Top products</h2>
      {top.length === 0 ? (
        <div className="mt-3">
          <EmptyState text="Пока нет продаж" />
        </div>
      ) : (
        <div className="mt-3">
          <TableShell>
            <thead>
              <tr className="border-b bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Sold</th>
                <th className="px-4 py-3">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {top.map((p, i) => (
                <tr key={p.product_id || i} className="border-b last:border-0">
                  <td className="px-4 py-3">{p.title || p.product_id || "—"}</td>
                  <td className="px-4 py-3">{p.sold ?? 0}</td>
                  <td className="px-4 py-3">{Number(p.revenue || 0).toLocaleString("ru-RU")} UZS</td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        </div>
      )}
    </div>
  );
}
