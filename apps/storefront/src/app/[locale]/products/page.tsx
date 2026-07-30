import Link from "next/link";
import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { apiPublic, publicTags, type Product } from "@/lib/api";
import { getCategories, getSearchFacets } from "@/lib/catalog";
import { extractSearchItems } from "@/lib/search";
import { buildFilterHref, countActiveFilters, type FilterState } from "@/lib/filters";
import { ProductGrid } from "@/components/ProductGrid";
import { Pagination } from "@/components/Pagination";
import { FilterSheet } from "@/components/FilterSheet";
import { ActiveFilterChips, CatalogFilters, type FilterCategory } from "@/components/CatalogFilters";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const titles: Record<string, string> = {
    uz: "Katalog — Gayrat Market",
    ru: "Каталог — Gayrat Market",
    en: "Catalog — Gayrat Market",
    ar: "كتالوج — Gayrat Market",
  };
  const descriptions: Record<string, string> = {
    uz: "Gayrat marketplace katalogi — kategoriya va narx filterlari bilan.",
    ru: "Каталог товаров маркетплейса Gayrat с фильтрами по категориям и цене.",
    en: "Gayrat marketplace catalog with category and price filters.",
    ar: "كتالوج سوق Gayrat مع فلاتر الفئة والسعر.",
  };
  return {
    title: titles[locale] || titles.uz,
    description: descriptions[locale] || descriptions.uz,
    robots: { index: true, follow: true },
  };
}

const PAGE_SIZE = 12;

export default async function ProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    category?: string;
    sort?: string;
    min?: string;
    max?: string;
    q?: string;
    page?: string;
    featured?: string;
    on_sale?: string;
    in_stock?: string;
  }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations();
  const page = Math.max(1, Number(sp.page || 1) || 1);

  let products: Product[] = [];
  let categories: FilterCategory[] = [];
  let facets: { categories?: { category_id: string; count: number }[]; price_ranges?: { min: number; max: number }[] } =
    {};
  let total = 0;

  const qs = new URLSearchParams();
  qs.set("limit", String(PAGE_SIZE));
  qs.set("page", String(page));
  if (sp.sort) qs.set("sort", sp.sort);
  if (sp.min) qs.set("min_price", sp.min);
  if (sp.max) qs.set("max_price", sp.max);
  if (sp.featured) qs.set("featured", "true");
  if (sp.on_sale) qs.set("on_sale", "true");
  if (sp.in_stock) qs.set("in_stock", "true");

  try {
    const [cats, facetData] = await Promise.all([getCategories(), getSearchFacets()]);
    categories = cats as FilterCategory[];
    facets = facetData || {};

    if (sp.q) {
      const searchQs = new URLSearchParams(qs);
      searchQs.set("q", sp.q);
      searchQs.set("locale", locale);
      if (sp.category) {
        const cat = categories.find((c) => c.slug === sp.category);
        if (cat?.id) searchQs.set("category_id", cat.id);
      }
      const prod = await apiPublic<{
        items?: Product[];
        result?: { hits?: { hits?: { _source?: Product }[] } };
        total?: number;
        results_count?: number;
      }>(`/v1/search?${searchQs.toString()}`, {
        revalidate: 30,
        tags: publicTags("search"),
      });
      products = extractSearchItems(prod);
      total = prod.results_count ?? prod.total ?? products.length;
    } else if (sp.category) {
      const prod = await apiPublic<{ items: Product[]; total?: number }>(
        `/v1/categories/${sp.category}/products?${qs.toString()}`,
        { revalidate: 60, tags: publicTags("products") }
      );
      products = prod.items || [];
      total = prod.total ?? products.length;
    } else {
      const prod = await apiPublic<{ items: Product[]; total?: number }>(`/v1/products?${qs.toString()}`, {
        revalidate: 60,
        tags: publicTags("products"),
      });
      products = prod.items || [];
      total = prod.total ?? products.length;
    }
  } catch {
    products = [];
    total = 0;
  }

  const values: FilterState = {
    category: sp.category,
    sort: sp.sort,
    min: sp.min,
    max: sp.max,
    q: sp.q,
    featured: sp.featured ? "1" : undefined,
    on_sale: sp.on_sale ? "1" : undefined,
    in_stock: sp.in_stock ? "1" : undefined,
  };
  const basePath = `/${locale}/products`;
  const clearHref = sp.q ? `${basePath}?q=${encodeURIComponent(sp.q)}` : basePath;
  const activeCount = countActiveFilters(values, { ignoreSort: true });

  return (
    <div className="animate-rise lg:grid lg:grid-cols-[240px_1fr] lg:gap-10">
      <FilterSheet activeCount={activeCount} resultCount={total} clearHref={clearHref}>
        <CatalogFilters
          locale={locale}
          basePath={basePath}
          values={values}
          categories={categories}
          mode="catalog"
          priceRanges={facets.price_ranges}
        />
      </FilterSheet>
      <div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-night sm:text-3xl">
              {t("nav.catalog")}
            </h1>
            <p className="mt-1 text-sm text-muted">{t("catalog.found", { count: total })}</p>
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
            { sort: "newest", label: t("catalog.sortNewest") },
            { sort: "price_asc", label: t("catalog.sortPriceAsc") },
            { sort: "price_desc", label: t("catalog.sortPriceDesc") },
          ].map((s) => (
            <Link
              key={s.sort}
              href={buildFilterHref(basePath, values, {
                sort: values.sort === s.sort ? undefined : s.sort,
              })}
              className={`shrink-0 rounded-full px-3.5 py-1.5 font-medium transition ${
                sp.sort === s.sort
                  ? "bg-accent text-night"
                  : "border border-night/10 bg-white hover:border-accent/40"
              }`}
            >
              {s.label}
            </Link>
          ))}
        </div>
        <ProductGrid products={products} locale={locale} columns={5} />
        <Pagination
          locale={locale}
          basePath={basePath}
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          params={values}
        />
      </div>
    </div>
  );
}
