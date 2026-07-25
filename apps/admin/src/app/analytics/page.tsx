"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Card } from "@gayrat/ui";
import { api, errMsg } from "@/lib/api";
import { Msg, PageHeader, SectionTabs } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

function csvEscape(v: string) {
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

type Overview = {
  revenue?: number;
  orders?: number;
  customers?: number;
  conversion?: number;
  product_views?: number;
  add_to_cart?: number;
  top_products?: { title: string; sold: number; revenue: number }[];
  geo?: { region: string; total: number }[];
};

type BannerRow = {
  banner_id: string;
  kind: string;
  image_url: string;
  link: string;
  active: boolean;
  impressions: number;
  clicks: number;
  ctr: number;
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

export default function AnalyticsPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<"overview" | "banners" | "products">("overview");
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Overview>({});
  const [rt, setRt] = useState<{ active_users?: number; orders_today?: number; active_carts?: number; orders_last_hour?: number }>({});
  const [searchAnalytics, setSearchAnalytics] = useState<{
    popular?: { query: string; cnt: number }[];
    zero_results?: { query: string; cnt: number }[];
  }>({});
  const [banners, setBanners] = useState<{ items?: BannerRow[]; totals?: { impressions: number; clicks: number; ctr: number } }>({});
  const [products, setProducts] = useState<{ items?: ProductRow[]; totals?: { views: number; add_to_cart: number; sold: number } }>({});
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api<Overview>("/v1/analytics/tenant/overview")
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

  useEffect(() => {
    if (tab === "banners") {
      api<typeof banners>(`/v1/analytics/banners?days=${days}`)
        .then(setBanners)
        .catch((e) => setMsg(errMsg(e)));
    }
    if (tab === "products") {
      api<typeof products>(`/v1/analytics/products?days=${days}`)
        .then(setProducts)
        .catch((e) => setMsg(errMsg(e)));
    }
  }, [tab, days]);

  const chartData = useMemo(
    () =>
      (data.top_products || []).slice(0, 8).map((p) => ({
        name: (p.title || "item").slice(0, 16),
        revenue: p.revenue || 0,
        sold: p.sold || 0,
      })),
    [data.top_products]
  );

  const bannerChart = useMemo(
    () =>
      (banners.items || []).slice(0, 8).map((b) => ({
        name: `${b.kind}`.slice(0, 10),
        impressions: b.impressions,
        clicks: b.clicks,
      })),
    [banners.items]
  );

  function exportCsv() {
    const rows =
      tab === "banners"
        ? [
            ["banner_id", "kind", "impressions", "clicks", "ctr"],
            ...((banners.items || []).map((b) => [
              b.banner_id,
              b.kind,
              String(b.impressions),
              String(b.clicks),
              String(b.ctr),
            ]) as string[][]),
          ]
        : tab === "products"
          ? [
              ["product", "views", "clicks", "atc", "sold", "ctr", "conversion"],
              ...((products.items || []).map((p) => [
                p.title,
                String(p.views),
                String(p.clicks),
                String(p.add_to_cart),
                String(p.sold),
                String(p.ctr),
                String(p.conversion),
              ]) as string[][]),
            ]
          : [
              ["metric", "value"],
              ["revenue", String(data.revenue ?? 0)],
              ["orders", String(data.orders ?? 0)],
              ["customers", String(data.customers ?? 0)],
              ["conversion", String(data.conversion ?? 0)],
              ...((data.top_products || []).map((p) => [p.title || "", String(p.revenue)]) as string[][]),
            ];
    const blob = new Blob([rows.map((r) => r.map(csvEscape).join(",")).join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `analytics-${tab}.csv`;
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
      <div className="mt-4">
        <SectionTabs
          items={[
            { id: "overview", label: "Overview" },
            { id: "banners", label: "Banners" },
            { id: "products", label: "Products" },
          ]}
          value={tab}
          onChange={(id) => setTab(id as typeof tab)}
        />
      </div>

      {tab !== "overview" ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {[7, 14, 30, 90].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={`rounded-xl px-3 py-1.5 text-sm font-semibold ${
                days === d ? "bg-teal text-white" : "bg-slate-100 text-slate-700"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      ) : null}

      {loading && tab === "overview" && <p className="mt-4 text-sm text-slate-500">{t("commonLoading")}</p>}

      {tab === "overview" ? (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <p className="text-sm text-slate-500">Revenue</p>
              <p className="mt-2 text-2xl font-bold text-teal">{(data.revenue ?? 0).toLocaleString()} UZS</p>
            </Card>
            <Card>
              <p className="text-sm text-slate-500">Orders</p>
              <p className="mt-2 text-2xl font-bold">{data.orders ?? 0}</p>
            </Card>
            <Card>
              <p className="text-sm text-slate-500">Product views</p>
              <p className="mt-2 text-2xl font-bold">{data.product_views ?? 0}</p>
            </Card>
            <Card>
              <p className="text-sm text-slate-500">Conversion</p>
              <p className="mt-2 text-2xl font-bold">{(data.conversion ?? 0).toFixed(2)}%</p>
            </Card>
          </div>
          <p className="mt-4 text-sm text-slate-500">
            Realtime: users {rt.active_users ?? rt.active_carts ?? "—"} · orders today{" "}
            {rt.orders_today ?? rt.orders_last_hour ?? "—"} · ATC {data.add_to_cart ?? 0}
          </p>
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
        </>
      ) : null}

      {tab === "banners" ? (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <Card>
              <p className="text-sm text-slate-500">Impressions</p>
              <p className="mt-2 text-2xl font-bold">{banners.totals?.impressions ?? 0}</p>
            </Card>
            <Card>
              <p className="text-sm text-slate-500">Clicks</p>
              <p className="mt-2 text-2xl font-bold">{banners.totals?.clicks ?? 0}</p>
            </Card>
            <Card>
              <p className="text-sm text-slate-500">CTR</p>
              <p className="mt-2 text-2xl font-bold text-teal">{(banners.totals?.ctr ?? 0).toFixed(2)}%</p>
            </Card>
          </div>
          <div className="mt-4 h-64 rounded border bg-white p-4">
            {bannerChart.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bannerChart}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="impressions" fill="#94a3b8" name="Impressions" />
                  <Bar dataKey="clicks" fill="#0f766e" name="Clicks" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-slate-500">No banner events yet — open the storefront home page.</p>
            )}
          </div>
          <ul className="mt-4 space-y-3">
            {(banners.items || []).map((b) => (
              <li key={b.banner_id}>
                <Card className="overflow-hidden p-0">
                  <div className="flex gap-3 p-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={b.image_url} alt="" className="h-16 w-28 rounded-lg object-cover" />
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="font-semibold capitalize">
                        {b.kind} · CTR {b.ctr.toFixed(2)}%
                      </p>
                      <p className="truncate text-slate-500">{b.link || "no link"}</p>
                      <p className="mt-1 text-slate-600">
                        {b.impressions} views · {b.clicks} clicks
                      </p>
                    </div>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {tab === "products" ? (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <Card>
              <p className="text-sm text-slate-500">Views</p>
              <p className="mt-2 text-2xl font-bold">{products.totals?.views ?? 0}</p>
            </Card>
            <Card>
              <p className="text-sm text-slate-500">Add to cart</p>
              <p className="mt-2 text-2xl font-bold">{products.totals?.add_to_cart ?? 0}</p>
            </Card>
            <Card>
              <p className="text-sm text-slate-500">Sold</p>
              <p className="mt-2 text-2xl font-bold text-teal">{products.totals?.sold ?? 0}</p>
            </Card>
          </div>
          <div className="mt-4 overflow-x-auto rounded-xl border bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-start">Product</th>
                  <th className="px-3 py-2 text-end">Imp</th>
                  <th className="px-3 py-2 text-end">Clicks</th>
                  <th className="px-3 py-2 text-end">Views</th>
                  <th className="px-3 py-2 text-end">ATC</th>
                  <th className="px-3 py-2 text-end">Sold</th>
                  <th className="px-3 py-2 text-end">CTR</th>
                  <th className="px-3 py-2 text-end">Conv</th>
                </tr>
              </thead>
              <tbody>
                {(products.items || []).map((p) => (
                  <tr key={p.product_id} className="border-t">
                    <td className="px-3 py-2 font-medium">{p.title || p.slug}</td>
                    <td className="px-3 py-2 text-end">{p.impressions}</td>
                    <td className="px-3 py-2 text-end">{p.clicks}</td>
                    <td className="px-3 py-2 text-end">{p.views}</td>
                    <td className="px-3 py-2 text-end">{p.add_to_cart}</td>
                    <td className="px-3 py-2 text-end">{p.sold}</td>
                    <td className="px-3 py-2 text-end">{p.ctr.toFixed(1)}%</td>
                    <td className="px-3 py-2 text-end">{p.conversion.toFixed(1)}%</td>
                  </tr>
                ))}
                {(products.items || []).length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-6 text-center text-slate-500">
                      No product funnel data yet
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}
