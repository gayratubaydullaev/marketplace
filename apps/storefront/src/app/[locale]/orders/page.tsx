"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { formatUZS, type Locale } from "@gayrat/i18n";
import { api } from "@/lib/api";
import { EmptyState, PageHeader, StatusBadge } from "@/components/PageChrome";

type Order = {
  id: string;
  order_number: string;
  status: string;
  total: number;
  created_at: string;
};

function statusLabel(t: ReturnType<typeof useTranslations>, status: string) {
  const key = `status${status.charAt(0).toUpperCase()}${status.slice(1)}` as
    | "statusPending"
    | "statusConfirmed"
    | "statusProcessing"
    | "statusShipped"
    | "statusDelivered"
    | "statusCompleted"
    | "statusCancelled";
  try {
    return t(key);
  } catch {
    return status;
  }
}

export default function OrdersPage() {
  const locale = useLocale();
  const t = useTranslations("orders");
  const [items, setItems] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    const has = Boolean(localStorage.getItem("access_token"));
    setAuthed(has);
    if (!has) {
      setLoading(false);
      setItems([]);
      return;
    }
    api<{ items: Order[] }>("/v1/orders")
      .then((d) => setItems(d.items || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="animate-rise">
      <PageHeader title={t("title")} />
      {loading ? (
        <div className="mt-8 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-night/5" />
          ))}
        </div>
      ) : !authed ? (
        <div className="mt-8">
          <EmptyState
            title={t("loginRequired")}
            actionHref={`/${locale}/account`}
            actionLabel={t("loginCta")}
          />
        </div>
      ) : items.length === 0 ? (
        <div className="mt-8">
          <EmptyState title={t("empty")} actionHref={`/${locale}/products`} actionLabel={t("browse")} />
        </div>
      ) : (
        <ul className="mt-8 space-y-3">
          {items.map((o) => (
            <li key={o.id}>
              <Link
                href={`/${locale}/orders/${o.id}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-night/8 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition hover:border-accent/30 hover:shadow-md sm:p-5"
              >
                <div className="min-w-0">
                  <p className="font-bold text-night">{o.order_number}</p>
                  <p className="mt-1 text-xs text-night/45">
                    {o.created_at ? new Date(o.created_at).toLocaleDateString(locale) : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <StatusBadge status={o.status} label={statusLabel(t, o.status)} />
                  <p className="text-sm font-bold text-night">
                    {formatUZS(o.total, locale as Locale)}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
