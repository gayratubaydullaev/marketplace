"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { apiPublic, publicTags, type Product } from "@/lib/api";
import { extractSearchItems, pushRecentSearch } from "@/lib/search";
import { buildFilterHref, countActiveFilters, type FilterState } from "@/lib/filters";
import { EmptyState, ErrorPanel, ProductGridSkeleton } from "@/components/PageChrome";
import { ProductGrid } from "@/components/ProductGrid";
import { Pagination } from "@/components/Pagination";
import { FilterSheet } from "@/components/FilterSheet";
import { ActiveFilterChips, CatalogFilters, type FilterCategory } from "@/components/CatalogFilters";
import { SearchLanding } from "@/components/HeaderSearch";

const PAGE_SIZE = 24;

function SearchInner() {
  const locale = useLocale();
  const t = useTranslations();
  const searchParams = useSearchParams();
  const q = searchParams.get("q") || "";
  const sort = searchParams.get("sort") || "relevance";
  const categoryId = searchParams.get("category_id") || "";
  const min = searchParams.get("min") || "";
  const max = searchParams.get("max") || "";
  const featured = searchParams.get("featured") || "";
  const onSale = searchParams.get("on_sale") || "";
  const inStock = searchParams.get("in_stock") || "";
  const page = Math.max(1, Number(searchParams.get("page") || 1) || 1);

  const [items, setItems] = useState<Product[]>([]);
  const [categories, setCategories] = useState<FilterCategory[]>([]);
  const [facets, setFacets] = useState<{
    categories?: { category_id: string; count: number }[];
    price_ranges?: { min: number; max: number }[];
  }>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const values: FilterState = {
    q: q || undefined,
    sort: sort !== "relevance" ? sort : undefined,
    category_id: categoryId || undefined,
    min: min || undefined,
    max: max || undefined,
    featured: featured ? "1" : undefined,
    on_sale: onSale ? "1" : undefined,
    in_stock: inStock ? "1" : undefined,
  };
  const basePath = `/${locale}/search`;
  const clearHref = q ? `${basePath}?q=${encodeURIComponent(q)}` : basePath;
  const activeCount = countActiveFilters(values, { ignoreSort: true });

  const facetCountMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of facets.categories || []) {
      if (c?.category_id) m.set(c.category_id, c.count);
    }
    return m;
  }, [facets]);

  useEffect(() => {
    Promise.all([
      apiPublic<typeof facets>("/v1/search/facets", { revalidate: 120, tags: publicTags("facets") }),
      apiPublic<{ items: FilterCategory[] }>("/v1/categories", {
        revalidate: 120,
        tags: publicTags("categories"),
      }),
    ])
      .then(([f, c]) => {
        setFacets(f || {});
        setCategories(c.items || []);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!q.trim()) {
      setItems([]);
      setTotal(0);
      setLoading(false);
      setError(false);
      return;
    }
    pushRecentSearch(q);
    let cancelled = false;
    setLoading(true);
    setError(false);
    const tmr = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          q,
          locale,
          sort,
          page: String(page),
          limit: String(PAGE_SIZE),
        });
        if (categoryId) params.set("category_id", categoryId);
        if (min) params.set("min_price", min);
        if (max) params.set("max_price", max);
        if (featured) params.set("featured", "true");
        if (onSale) params.set("on_sale", "true");
        if (inStock) params.set("in_stock", "true");
        const data = await apiPublic<{
          items?: Product[];
          results_count?: number;
          total?: number;
          result?: { hits?: { hits?: { _source?: Product }[] } };
        }>(`/v1/search?${params.toString()}`, { revalidate: 30, tags: publicTags("search") });
        if (cancelled) return;
        const list = extractSearchItems(data);
        setItems(list);
        setTotal(data.results_count ?? data.total ?? list.length);
      } catch {
        if (!cancelled) {
          setItems([]);
          setTotal(0);
          setError(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 80);
    return () => {
      cancelled = true;
      clearTimeout(tmr);
    };
  }, [q, locale, sort, page, categoryId, min, max, featured, onSale, inStock, reloadKey]);

  if (!q.trim()) {
    return <SearchLanding locale={locale} />;
  }

  return (
    <div className="animate-rise lg:grid lg:grid-cols-[minmax(12.5rem,15rem)_minmax(0,1fr)] lg:gap-8 xl:grid-cols-[minmax(14rem,16rem)_minmax(0,1fr)] xl:gap-12">
      <FilterSheet activeCount={activeCount} resultCount={total} clearHref={clearHref}>
        <CatalogFilters
          locale={locale}
          basePath={basePath}
          values={values}
          categories={categories}
          mode="search"
          priceRanges={facets.price_ranges}
          facetCounts={facetCountMap}
        />
      </FilterSheet>

      <div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-night sm:text-3xl">
              {t("search.title")}
            </h1>
            <p className="mt-1 text-sm text-muted">
              “{q}” · {t("catalog.found", { count: total })}
            </p>
          </div>
        </div>

        <ActiveFilterChips
          locale={locale}
          basePath={basePath}
          values={values}
          categories={categories}
          clearHref={clearHref}
        />

        <div className="mt-2 flex gap-2 overflow-x-auto pb-1 text-sm sm:flex-wrap sm:overflow-visible">
          {[
            { sort: "relevance", label: t("catalog.sortRelevance") },
            { sort: "price_asc", label: t("catalog.sortPriceAsc") },
            { sort: "price_desc", label: t("catalog.sortPriceDesc") },
            { sort: "newest", label: t("catalog.sortNewest") },
          ].map((s) => (
            <Link
              key={s.sort}
              href={buildFilterHref(basePath, values, {
                sort: s.sort === "relevance" ? undefined : s.sort,
              })}
              className={`shrink-0 rounded-full px-3.5 py-1.5 font-medium ${
                sort === s.sort
                  ? "bg-accent text-night"
                  : "border border-night/10 bg-white hover:border-accent/40"
              }`}
            >
              {s.label}
            </Link>
          ))}
        </div>

        {loading ? (
          <ProductGridSkeleton count={8} />
        ) : error ? (
          <ErrorPanel
            title={t("common.error")}
            description={t("search.tryDifferent")}
            onRetry={() => setReloadKey((k) => k + 1)}
            retryLabel={t("common.retry")}
          />
        ) : items.length === 0 ? (
          <EmptyState
            title={t("search.noResults")}
            description={t("search.tryDifferent")}
            actionHref={`/${locale}/products`}
            actionLabel={t("nav.catalog")}
            variant="search"
          />
        ) : (
          <>
            <ProductGrid products={items} locale={locale} columns={4} />
            <Pagination
              locale={locale}
              basePath={basePath}
              page={page}
              pageSize={PAGE_SIZE}
              total={Math.max(total, items.length)}
              params={values}
            />
          </>
        )}
      </div>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="animate-pulse py-10">
          <div className="h-8 w-40 rounded-lg bg-night/10" />
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="aspect-[3/4] rounded-2xl bg-night/8" />
            ))}
          </div>
        </div>
      }
    >
      <SearchInner />
    </Suspense>
  );
}
