"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { Product } from "@/lib/api";
import { ProductCard } from "@/components/ProductCard";

const colClass = {
  2: "grid-cols-2",
  3: "grid-cols-2 sm:grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
  5: "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6",
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

  if (products.length === 0) {
    return (
      <div className="mt-10 px-4 py-12 text-center">
        <p className="text-sm text-muted">{t("common.emptyProducts")}</p>
        <Link
          href={`/${locale}/products`}
          className="mt-4 inline-block rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-night transition hover:bg-accent-hover"
        >
          {t("nav.catalog")}
        </Link>
      </div>
    );
  }

  return (
    <div
      className={`mt-5 grid gap-x-2.5 gap-y-5 sm:mt-6 sm:gap-x-4 sm:gap-y-7 ${colClass[columns]} ${className}`}
    >
      {products.map((p, i) => (
        <ProductCard key={p.id} product={p} locale={locale} index={i} animate={animate} />
      ))}
    </div>
  );
}
