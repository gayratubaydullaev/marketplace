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
  product_views?: number;
  product_clicks?: number;
  add_to_cart?: number;
  conversion?: number;
  top_products?: { product_id?: string; title?: string; sold?: number; revenue?: number }[];
};

type ProductRow = {
  product_id: string;
  title: string;
  slug: string;
  impressions: number;
  clicks: number;
  views: number;
  add_to_cart: number;
  sold: number;
  revenue: number;
  ctr: number;
  conversion: number;
};

export default function VendorAnalytics() {
  const { t } = useI18n();
  const [data, setData] = useState<Overview>({});
  const [funnel, setFunnel] = useState<ProductRow[]>([]);
  const [days, setDays] = useState(30);
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

  useEffect(() => {
    api<{ items?: ProductRow[] }>(`/v1/analytics/vendor/products?days=${days}`)
      .then((d) => setFunnel(d.items || []))
      .catch(() => setFunnel([]));
  }, [days]);

  const top = data.top_products || [];

  return (
    <div>
      <PageHeader title={t("pageAnalyticsTitle")} description={t("pageAnalyticsDesc")} />
      <Msg text={msg} />
      <div className="mt-2 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Revenue</p>
          <p className="mt-2 font-display text-2xl font-bold text-teal">
            {(data.revenue ?? 0).toLocaleString("ru-RU")} {data.currency || "UZS"}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Orders</p>
          <p className="mt-2 font-display text-2xl font-bold">{data.orders ?? 0}</p>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Views</p>
          <p className="mt-2 font-display text-2xl font-bold">{data.product_views ?? 0}</p>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
          <p className="text-sm text-slate-500">Conversion</p>
          <p className="mt-2 font-display text-2xl font-bold">{(data.conversion ?? 0).toFixed(2)}%</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3 text-sm text-slate-600">
        <span>Clicks: {data.product_clicks ?? 0}</span>
        <span>·</span>
        <span>Add to cart: {data.add_to_cart ?? 0}</span>
        <span>·</span>
        <span>Commission: {(data.commission ?? 0).toLocaleString("ru-RU")}</span>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Product funnel</h2>
        <div className="flex gap-2">
          {[7, 14, 30].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold ${
                days === d ? "bg-teal text-white" : "bg-slate-100 text-slate-700"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {funnel.length === 0 ? (
        <div className="mt-3">
          <EmptyState text="Пока нет просмотров — откройте витрину с вашими товарами" />
        </div>
      ) : (
        <div className="mt-3">
          <TableShell>
            <thead>
              <tr className="border-b bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">Views</th>
                <th className="px-4 py-3">Clicks</th>
                <th className="px-4 py-3">ATC</th>
                <th className="px-4 py-3">Sold</th>
                <th className="px-4 py-3">CTR</th>
                <th className="px-4 py-3">Conv</th>
              </tr>
            </thead>
            <tbody>
              {funnel.map((p) => (
                <tr key={p.product_id} className="border-b last:border-0">
                  <td className="px-4 py-3">{p.title || p.slug}</td>
                  <td className="px-4 py-3">{p.views + p.impressions}</td>
                  <td className="px-4 py-3">{p.clicks}</td>
                  <td className="px-4 py-3">{p.add_to_cart}</td>
                  <td className="px-4 py-3">{p.sold}</td>
                  <td className="px-4 py-3">{p.ctr.toFixed(1)}%</td>
                  <td className="px-4 py-3">{p.conversion.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        </div>
      )}

      <h2 className="mt-8 font-semibold">Top by sales</h2>
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
