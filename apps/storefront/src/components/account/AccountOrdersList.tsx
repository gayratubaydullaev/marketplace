"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { formatUZS, type Locale } from "@gayrat/i18n";
import { EmptyState, StatusBadge } from "@/components/PageChrome";
import { orderStatusLabel, type Order } from "@/components/account/types";

type Filter = "all" | "active" | "done" | "cancelled";

const ACTIVE = new Set(["pending", "confirmed", "processing", "shipped"]);
const DONE = new Set(["delivered", "completed"]);
const CANCELLED = new Set(["cancelled"]);

function matchesFilter(status: string, filter: Filter) {
  if (filter === "all") return true;
  if (filter === "active") return ACTIVE.has(status);
  if (filter === "done") return DONE.has(status);
  if (filter === "cancelled") return CANCELLED.has(status);
  return true;
}

export function AccountOrdersList({
  orders,
  loading,
  emptyTitle,
}: {
  orders: Order[];
  loading: boolean;
  emptyTitle: string;
}) {
  const t = useTranslations("account");
  const to = useTranslations("orders");
  const locale = useLocale();
  const [filter, setFilter] = useState<Filter>("all");

  const filtered = useMemo(
    () => orders.filter((o) => matchesFilter(o.status, filter)),
    [orders, filter]
  );

  const chips: { id: Filter; label: string }[] = [
    { id: "all", label: t("ordersFilterAll") },
    { id: "active", label: t("ordersFilterActive") },
    { id: "done", label: t("ordersFilterDone") },
    { id: "cancelled", label: t("ordersFilterCancelled") },
  ];

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-night/5" />
        ))}
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-night/12 bg-white/60">
        <EmptyState
          title={emptyTitle}
          description={t("noOrdersHint")}
          actionHref={`/${locale}/products`}
          actionLabel={t("browseCatalog")}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {chips.map((chip) => (
          <button
            key={chip.id}
            type="button"
            onClick={() => setFilter(chip.id)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition sm:text-sm ${
              filter === chip.id
                ? "bg-night text-paper"
                : "bg-night/5 text-muted hover:bg-night/8 hover:text-night"
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-night/10 bg-white/70 px-4 py-10 text-center">
          <p className="text-sm font-medium text-muted">{t("ordersFilterEmpty")}</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((o) => (
            <li key={o.id}>
              <Link
                href={`/${locale}/orders/${o.id}`}
                className="group flex items-center gap-3 rounded-2xl border border-night/8 bg-white p-4 transition hover:border-accent/30 hover:shadow-sm sm:gap-4 sm:p-5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold text-night">{o.order_number}</p>
                    <StatusBadge status={o.status} label={orderStatusLabel(to, o.status)} />
                  </div>
                  <p className="mt-1.5 text-xs text-muted">
                    {o.created_at
                      ? new Date(o.created_at).toLocaleDateString(locale, {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })
                      : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <p className="text-base font-bold tabular-nums text-night sm:text-lg">
                    {formatUZS(o.total, locale as Locale)}
                  </p>
                  <span className="text-xs font-semibold text-teal opacity-80 transition group-hover:opacity-100">
                    {t("openOrder")}
                  </span>
                </div>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="hidden shrink-0 text-night/25 transition group-hover:text-teal sm:block rtl:rotate-180"
                  aria-hidden
                >
                  <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
