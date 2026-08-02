"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@gayrat/ui";
import { api, errMsg } from "@/lib/api";
import { EmptyState, Msg, PageHeader, SectionTabs, StatusBadge, TableShell } from "@/components/ui";
import { useI18n } from "@/lib/i18n";

type Tab = "products" | "kyc" | "reviews";

type Product = {
  id: string;
  slug: string;
  price: number;
  status: string;
  translations?: Record<string, { name?: string }>;
};

type Vendor = {
  id: string;
  name: string;
  slug: string;
  status: string;
  kyc_status?: string;
};

type Review = {
  id: string;
  rating: number;
  title?: string;
  body?: string;
  status?: string;
  author_name?: string;
  created_at?: string;
};

export default function ModerationPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("products");
  const [products, setProducts] = useState<Product[]>([]);
  const [kycItems, setKycItems] = useState<Vendor[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState("");

  async function loadProducts() {
    const data = await api<{ items: Product[] }>("/v1/products?status=pending_review&limit=100&page=1");
    setProducts(data.items || []);
  }

  async function loadKyc() {
    const data = await api<{ items: Vendor[] }>("/v1/admin/vendors/kyc/pending");
    setKycItems(data.items || []);
  }

  async function loadReviews() {
    const data = await api<{ items: Review[] }>("/v1/admin/reviews?status=pending");
    setReviews(data.items || []);
  }

  useEffect(() => {
    setMsg("");
    const loader =
      tab === "products" ? loadProducts : tab === "kyc" ? loadKyc : loadReviews;
    loader().catch((e) => setMsg(errMsg(e)));
  }, [tab]);

  async function moderateProduct(id: string, status: string) {
    setMsg("");
    await api(`/v1/admin/products/${id}/moderate`, { method: "POST", body: JSON.stringify({ status }) });
    setOk(t("moderationProductDone"));
    await loadProducts();
  }

  async function setKyc(id: string, kycStatus: "approved" | "rejected") {
    setMsg("");
    await api(`/v1/admin/vendors/${id}/kyc`, { method: "POST", body: JSON.stringify({ status: kycStatus }) });
    setOk(t("moderationKycDone"));
    await loadKyc();
  }

  async function moderateReview(id: string, status: string) {
    setMsg("");
    await api(`/v1/admin/reviews/${id}/moderate`, { method: "POST", body: JSON.stringify({ status }) });
    setOk(t("moderationReviewDone"));
    await loadReviews();
  }

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "products", label: t("moderationTabProducts"), count: products.length },
    { id: "kyc", label: t("moderationTabKyc"), count: kycItems.length },
    { id: "reviews", label: t("moderationTabReviews"), count: reviews.length },
  ];

  return (
    <div>
      <PageHeader title={t("pageModerationTitle")} description={t("pageModerationDesc")} />
      <SectionTabs
        items={tabs.map(({ id, label, count }) => ({
          id,
          label: count != null && tab !== id ? `${label} (${count})` : label,
        }))}
        value={tab}
        onChange={(id) => setTab(id as Tab)}
      />
      <Msg text={msg} />
      <Msg text={ok} tone="ok" />

      {tab === "products" && (
        products.length === 0 ? (
          <EmptyState text={t("moderationProductsEmpty")} />
        ) : (
          <div className="mt-4">
          <TableShell>
            <thead>
              <tr className="border-b bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">{t("productsColName")}</th>
                <th className="px-4 py-3">{t("productsColPrice")}</th>
                <th className="px-4 py-3">{t("productsColStatus")}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-b last:border-0 hover:bg-slate-50/60">
                  <td className="px-4 py-3">
                    <Link href={`/products/${p.id}`} className="font-medium text-teal hover:underline">
                      {p.translations?.uz?.name || p.slug}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{p.price.toLocaleString()} UZS</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="space-x-2 whitespace-nowrap px-4 py-3">
                    <Button variant="secondary" className="!px-2 !py-1 text-xs" onClick={() => moderateProduct(p.id, "active").catch((e) => setMsg(errMsg(e)))}>
                      {t("moderationApprove")}
                    </Button>
                    <Button variant="ghost" className="!px-2 !py-1 text-xs text-rose-700" onClick={() => moderateProduct(p.id, "archived").catch((e) => setMsg(errMsg(e)))}>
                      {t("moderationReject")}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>
          </div>
        )
      )}

      {tab === "kyc" && (
        kycItems.length === 0 ? (
          <EmptyState text={t("moderationKycEmpty")} />
        ) : (
          <div className="mt-4">
          <TableShell>
            <thead>
              <tr className="border-b bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">{t("navVendors")}</th>
                <th className="px-4 py-3">{t("commonStatus")}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {kycItems.map((v) => (
                <tr key={v.id} className="border-b last:border-0 hover:bg-slate-50/60">
                  <td className="px-4 py-3 font-medium">{v.name}</td>
                  <td className="px-4 py-3">{v.kyc_status || "pending"}</td>
                  <td className="space-x-2 px-4 py-3">
                    <Button variant="secondary" className="!px-2 !py-1 text-xs" onClick={() => setKyc(v.id, "approved").catch((e) => setMsg(errMsg(e)))}>
                      {t("moderationApprove")}
                    </Button>
                    <Button variant="ghost" className="!px-2 !py-1 text-xs text-rose-700" onClick={() => setKyc(v.id, "rejected").catch((e) => setMsg(errMsg(e)))}>
                      {t("moderationReject")}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>
          </div>
        )
      )}

      {tab === "reviews" && (
        reviews.length === 0 ? (
          <EmptyState text={t("moderationReviewsEmpty")} />
        ) : (
          <div className="mt-4">
          <TableShell>
            <thead>
              <tr className="border-b bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">{t("moderationReviewAuthor")}</th>
                <th className="px-4 py-3">{t("moderationReviewRating")}</th>
                <th className="px-4 py-3">{t("moderationReviewBody")}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {reviews.map((r) => (
                <tr key={r.id} className="border-b last:border-0 hover:bg-slate-50/60">
                  <td className="px-4 py-3">{r.author_name || "—"}</td>
                  <td className="px-4 py-3">{r.rating}★</td>
                  <td className="max-w-xs truncate px-4 py-3 text-sm">{r.body || r.title || "—"}</td>
                  <td className="space-x-2 px-4 py-3">
                    <Button variant="secondary" className="!px-2 !py-1 text-xs" onClick={() => moderateReview(r.id, "approved").catch((e) => setMsg(errMsg(e)))}>
                      {t("moderationApprove")}
                    </Button>
                    <Button variant="ghost" className="!px-2 !py-1 text-xs text-rose-700" onClick={() => moderateReview(r.id, "rejected").catch((e) => setMsg(errMsg(e)))}>
                      {t("moderationReject")}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>
          </div>
        )
      )}
    </div>
  );
}
