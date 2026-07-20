"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { api, type Product } from "@/lib/api";
import { ProductGrid } from "@/components/ProductGrid";
import { Pagination } from "@/components/Pagination";
import { FilterSheet } from "@/components/FilterSheet";
import { EmptyState } from "@/components/PageChrome";

const PAGE_SIZE = 12;

function extractItems(data: {
  items?: Product[];
  result?: { hits?: { hits?: { _source?: Product }[] } };
}): Product[] {
  if (data.items?.length) return data.items;
  return (data.result?.hits?.hits || []).map((h) => h._source!).filter(Boolean);
}

function SearchInner() {
  const locale = useLocale();
  const t = useTranslations();
  const searchParams = useSearchParams();
  const q = searchParams.get("q") || "";
  const sort = searchParams.get("sort") || "relevance";
  const categoryId = searchParams.get("category_id") || "";
  const page = Math.max(1, Number(searchParams.get("page") || 1) || 1);

  const [items, setItems] = useState<Product[]>([]);
  const [categories, setCategories] = useState<
    { id?: string; slug: string; translations: Record<string, { name?: string }> }[]
  >([]);
  const [facets, setFacets] = useState<{ categories?: { category_id: string; count: number }[] }>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      api<typeof facets>("/v1/search/facets"),
      api<{ items: typeof categories }>("/v1/categories"),
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
      return;
    }
    let cancelled = false;
    setLoading(true);
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
        const data = await api<{
          items?: Product[];
          results_count?: number;
          total?: number;
          result?: { hits?: { hits?: { _source?: Product }[] } };
        }>(`/v1/search?${params.toString()}`);
        if (cancelled) return;
        const list = extractItems(data);
        setItems(list);
        setTotal(data.results_count ?? data.total ?? list.length);
      } catch {
        if (!cancelled) {
          setItems([]);
          setTotal(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(tmr);
    };
  }, [q, locale, sort, page, categoryId]);

  function href(next: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    const merged = {
      q: q || undefined,
      sort: sort !== "relevance" ? sort : undefined,
      category_id: categoryId || undefined,
      page: page > 1 ? String(page) : undefined,
      ...next,
    };
    Object.entries(merged).forEach(([k, v]) => {
      if (v) params.set(k, v);
    });
    const s = params.toString();
    return s ? `/${locale}/search?${s}` : `/${locale}/search`;
  }

  function catLabel(id?: string) {
    if (!id) return "?";
    const c = categories.find((x) => x.id === id);
    return c?.translations?.[locale]?.name || c?.slug || id.slice(0, 8);
  }

  const facetCategories = (facets.categories || []).filter(
    (c): c is { category_id: string; count: number } => Boolean(c?.category_id)
  );
  const activeCount = (categoryId ? 1 : 0) + (sort !== "relevance" ? 1 : 0);

  if (!q.trim()) {
    return (
      <EmptyState
        title={t("search.title")}
        description={t("search.hint")}
        actionHref={`/${locale}/products`}
        actionLabel={t("nav.catalog")}
      />
    );
  }

  return (
    <div className="animate-rise lg:grid lg:grid-cols-[220px_1fr] lg:gap-10">
      <FilterSheet activeCount={activeCount}>
        <p className="text-sm font-bold uppercase tracking-wide text-muted">{t("nav.categories")}</p>
        <ul className="mt-2 space-y-1 text-sm">
          <li>
            <Link
              href={href({ category_id: undefined, page: undefined })}
              className={`block rounded-lg px-3 py-1.5 ${
                !categoryId ? "bg-accent-muted font-semibold text-teal" : "hover:bg-night/4"
              }`}
            >
              {t("catalog.all")}
            </Link>
          </li>
          {facetCategories.slice(0, 12).map((c) => (
            <li key={c.category_id}>
              <Link
                href={href({ category_id: c.category_id, page: undefined })}
                className={`block rounded-lg px-3 py-1.5 ${
                  categoryId === c.category_id
                    ? "bg-accent-muted font-semibold text-teal"
                    : "hover:bg-night/4"
                }`}
              >
                {catLabel(c.category_id)} ({c.count})
              </Link>
            </li>
          ))}
        </ul>
        {categoryId ? (
          <Link
            href={href({ category_id: undefined, page: undefined })}
            className="inline-block text-sm font-semibold text-teal hover:underline"
          >
            {t("catalog.clearFilters")}
          </Link>
        ) : null}
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

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1 text-sm sm:flex-wrap sm:overflow-visible">
          {[
            { sort: "relevance", label: t("catalog.sortRelevance") },
            { sort: "price_asc", label: t("catalog.sortPriceAsc") },
            { sort: "price_desc", label: t("catalog.sortPriceDesc") },
          ].map((s) => (
            <Link
              key={s.sort}
              href={href({ sort: s.sort === "relevance" ? undefined : s.sort, page: undefined })}
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
          <div className="mt-8 grid animate-pulse grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="aspect-[3/4] rounded-2xl bg-night/8" />
                <div className="h-3 w-2/3 rounded bg-night/10" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            title={t("search.noResults")}
            description={t("search.tryDifferent")}
            actionHref={`/${locale}/products`}
            actionLabel={t("nav.catalog")}
          />
        ) : (
          <>
            <ProductGrid products={items} locale={locale} columns={5} />
            <Pagination
              locale={locale}
              basePath={`/${locale}/search`}
              page={page}
              pageSize={PAGE_SIZE}
              total={Math.max(total, items.length)}
              params={{
                q: q || undefined,
                sort: sort !== "relevance" ? sort : undefined,
                category_id: categoryId || undefined,
              }}
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
