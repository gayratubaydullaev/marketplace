"use client";

import { useTranslations } from "next-intl";
import type { Product } from "@/lib/api";
import { ProductCard } from "@/components/ProductCard";
import { EmptyState } from "@/components/PageChrome";
import { useVendorMap } from "@/lib/vendors";

const colClass = {
  2: "grid-cols-2",
  3: "grid-cols-2 sm:grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5",
  5: "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6",
} as const;

export function ProductGrid({
  products,
  locale,
  columns = 5,
  animate = true,
  className = "",
}: {
  products: Product[];
  locale: string;
  columns?: 2 | 3 | 4 | 5;
  animate?: boolean;
  className?: string;
}) {
  const t = useTranslations();
  const vendors = useVendorMap();

  if (products.length === 0) {
    return (
      <EmptyState
        title={t("common.emptyProducts")}
        description={t("search.tryDifferent")}
        actionHref={`/${locale}/products`}
        actionLabel={t("nav.catalog")}
        variant="search"
      />
    );
  }

  const marginClass = /(?:^|\s)mt-/.test(className) ? "" : "mt-4";

  return (
    <div
      className={`${marginClass} grid gap-x-2 gap-y-3 sm:gap-x-3.5 sm:gap-y-5 lg:gap-x-4 lg:gap-y-6 xl:gap-x-5 ${colClass[columns]} ${className}`}
    >
      {products.map((p, i) => (
        <ProductCard
          key={p.id}
          product={p}
          locale={locale}
          index={i}
          animate={animate}
          priority={i < 6}
          vendor={p.vendor_id ? vendors[p.vendor_id] : undefined}
        />
      ))}
    </div>
  );
}
