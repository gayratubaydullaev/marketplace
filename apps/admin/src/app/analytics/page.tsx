"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Card } from "@gayrat/ui";
import { api, errMsg } from "@/lib/api";
import { Msg, PageHeader } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

function csvEscape(v: string) {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export default function AnalyticsPage() {
  const { t } = useI18n();
  const [data, setData] = useState<{
    revenue?: number;
    orders?: number;
    customers?: number;
    top_products?: { title: string; sold: number; revenue: number }[];
    geo?: { region: string; total: number }[];
  }>({});
  const [rt, setRt] = useState<{ active_carts?: number; orders_last_hour?: number }>({});
  const [searchAnalytics, setSearchAnalytics] = useState<{
    popular?: { query: string; cnt: number }[];
    zero_results?: { query: string; cnt: number }[];
  }>({});
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api<typeof data>("/v1/analytics/tenant/overview")
      .then(setData)
      .catch((e) => setMsg(errMsg(e)))
      .finally(() => setLoading(false));
    api<typeof searchAnalytics>("/v1/search/analytics")
      .then(setSearchAnalytics)
      .catch(() => undefined);
    const tick = () =>
      api<typeof rt>("/v1/analytics/realtime")
        .then(setRt)
        .catch(() => undefined);
    tick();
    const id = setInterval(tick, 10000);
    return () => clearInterval(id);
  }, []);

  const chartData = useMemo(
    () =>
      (data.top_products || []).slice(0, 8).map((p) => ({
        name: (p.title || "item").slice(0, 16),
        revenue: p.revenue || 0,
        sold: p.sold || 0,
      })),
    [data.top_products]
  );
  const overviewChartData = useMemo(
    () => [{ name: "Current total", revenue: data.revenue ?? 0, orders: data.orders ?? 0 }],
    [data.orders, data.revenue]
  );

  function exportCsv() {
    const rows = [
      ["metric", "value"],
      ["revenue", String(data.revenue ?? 0)],
      ["orders", String(data.orders ?? 0)],
      ["customers", String(data.customers ?? 0)],
      ...((data.top_products || []).map((p) => [p.title || "", String(p.revenue)]) as string[][]),
    ];
    const blob = new Blob([rows.map((r) => r.map(csvEscape).join(",")).join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "analytics.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <PageHeader
        title={t("pageAnalyticsTitle")}
        description={t("pageAnalyticsDesc")}
        actions={
          <Button variant="secondary" onClick={exportCsv}>
            Export CSV
          </Button>
        }
      />
      <Msg text={msg} />
      {loading && <p className="text-sm text-slate-500">{t("commonLoading")}</p>}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-sm text-slate-500">Revenue</p>
          <p className="mt-2 text-2xl font-bold text-teal">{(data.revenue ?? 0).toLocaleString()} UZS</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Orders</p>
          <p className="mt-2 text-2xl font-bold">{data.orders ?? 0}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Customers</p>
          <p className="mt-2 text-2xl font-bold">{data.customers ?? 0}</p>
        </Card>
      </div>
      <p className="mt-4 text-sm text-slate-500">
        Realtime: carts {rt.active_carts ?? "—"} · orders/hour {rt.orders_last_hour ?? "—"}
      </p>
      <h2 className="mt-8 text-xl font-bold">Revenue and orders</h2>
      <div className="mt-4 h-72 rounded border bg-white p-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={overviewChartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis yAxisId="revenue" tick={{ fontSize: 11 }} />
            <YAxis yAxisId="orders" orientation="right" tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar yAxisId="revenue" dataKey="revenue" name="Revenue (UZS)" fill="#0f766e" />
            <Bar yAxisId="orders" dataKey="orders" name="Orders" fill="#f59e0b" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <h2 className="mt-8 text-xl font-bold">Top products revenue</h2>
      <div className="mt-4 h-72 rounded border bg-white p-4">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="revenue" fill="#0f766e" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-slate-500">No chart data yet.</p>
        )}
      </div>
      <h2 className="mt-8 text-xl font-bold">Geo</h2>
      <ul className="mt-2 space-y-1 text-sm">
        {(data.geo || []).map((g, i) => (
          <li key={i}>
            {g.region || "—"}: {g.total?.toLocaleString()} UZS
          </li>
        ))}
        {(data.geo || []).length === 0 && <li className="text-slate-500">No geo data</li>}
      </ul>
      <h2 className="mt-8 text-xl font-bold">Search analytics</h2>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <Card>
          <p className="font-semibold">Popular queries</p>
          <ul className="mt-2 space-y-1 text-sm">
            {(searchAnalytics.popular || []).map((r, i) => (
              <li key={i}>
                {r.query}: {r.cnt}
              </li>
            ))}
            {(searchAnalytics.popular || []).length === 0 && <li className="text-slate-500">—</li>}
          </ul>
        </Card>
        <Card>
          <p className="font-semibold">Zero results</p>
          <ul className="mt-2 space-y-1 text-sm">
            {(searchAnalytics.zero_results || []).map((r, i) => (
              <li key={i}>
                {r.query}: {r.cnt}
              </li>
            ))}
            {(searchAnalytics.zero_results || []).length === 0 && <li className="text-slate-500">—</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}
