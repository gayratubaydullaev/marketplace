"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { api, type Product } from "@/lib/api";
import type { HeroSlide } from "@/components/HomeHero";
import { ProductGrid } from "@/components/ProductGrid";
import { PromoBanner } from "@/components/PromoBanner";

const PAGE_SIZE = 24;

/** Column counts must match ProductGrid `columns={5}` breakpoints. */
function columnsForWidth(w: number) {
  if (w >= 1280) return 6; // xl
  if (w >= 1024) return 5; // lg
  if (w >= 768) return 4; // md
  if (w >= 640) return 3; // sm
  return 2;
}

export function HomeProductsWithPromo({
  products: initialProducts,
  total: initialTotal,
  locale,
  promoSlides,
  emptyLabel,
}: {
  products: Product[];
  total: number;
  locale: string;
  promoSlides: HeroSlide[];
  emptyLabel: string;
}) {
  const t = useTranslations("home");
  const tc = useTranslations("common");
  const [cols, setCols] = useState(5);
  const [items, setItems] = useState(initialProducts);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(initialTotal);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);

  const hasMore = items.length < total;

  useEffect(() => {
    setItems(initialProducts);
    setTotal(initialTotal);
    setPage(1);
    setError(false);
  }, [initialProducts, initialTotal]);

  useEffect(() => {
    const queries = [
      window.matchMedia("(min-width: 1280px)"),
      window.matchMedia("(min-width: 1024px)"),
      window.matchMedia("(min-width: 768px)"),
      window.matchMedia("(min-width: 640px)"),
    ];
    function update() {
      setCols(columnsForWidth(window.innerWidth));
    }
    update();
    for (const q of queries) {
      q.addEventListener("change", update);
    }
    return () => {
      for (const q of queries) {
        q.removeEventListener("change", update);
      }
    };
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMore) return;
    loadingRef.current = true;
    setLoading(true);
    setError(false);
    const nextPage = page + 1;
    try {
      const data = await api<{ items: Product[]; total?: number }>(
        `/v1/products?sort=home&limit=${PAGE_SIZE}&page=${nextPage}`
      );
      const next = data.items || [];
      let mergedLen = 0;
      setItems((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        const merged = [...prev];
        for (const p of next) {
          if (!seen.has(p.id)) {
            seen.add(p.id);
            merged.push(p);
          }
        }
        mergedLen = merged.length;
        return merged;
      });
      if (next.length === 0) {
        setTotal(mergedLen);
      } else if (typeof data.total === "number") {
        setTotal(data.total);
      }
      setPage(nextPage);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, [hasMore, page]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          void loadMore();
        }
      },
      { rootMargin: "400px 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, loadMore]);

  if (items.length === 0) {
    return (
      <section className="home-section mt-3 sm:mt-8">
        <p className="mt-2 text-sm text-muted sm:mt-4">{emptyLabel}</p>
        <PromoBanner slides={promoSlides} />
      </section>
    );
  }

  const firstCount = Math.max(cols * 2, 4);
  const first = items.slice(0, firstCount);
  const rest = items.slice(firstCount);

  return (
    <>
      <section className="home-section mt-3 sm:mt-8" aria-label="products">
        <ProductGrid products={first} locale={locale} columns={5} animate className="mt-0" />
      </section>

      <PromoBanner slides={promoSlides} />

      {rest.length > 0 ? (
        <section className="home-section mt-3 sm:mt-8" aria-label="products-more">
          <ProductGrid products={rest} locale={locale} columns={5} animate className="mt-0" />
        </section>
      ) : null}

      <div ref={sentinelRef} className="h-8 w-full" aria-hidden />

      <div className="home-section pb-4 text-center sm:pb-6">
        {loading ? (
          <p className="text-sm text-muted">{tc("loading")}</p>
        ) : error ? (
          <button
            type="button"
            onClick={() => void loadMore()}
            className="rounded-xl border border-night/12 bg-white px-4 py-2 text-sm font-semibold text-night hover:border-accent/40"
          >
            {tc("retry")}
          </button>
        ) : !hasMore ? (
          <p className="text-xs text-muted">{t("feedEnd")}</p>
        ) : null}
      </div>
    </>
  );
}
