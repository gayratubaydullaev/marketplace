import Link from "next/link";
import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { api, type Product } from "@/lib/api";
import { ProductGrid } from "@/components/ProductGrid";
import { Pagination } from "@/components/Pagination";
import { FilterSheet } from "@/components/FilterSheet";

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

function buildFilterHref(locale: string, next: Record<string, string | undefined>) {
  const q = new URLSearchParams();
  Object.entries(next).forEach(([k, v]) => {
    if (v) q.set(k, v);
  });
  const s = q.toString();
  return s ? `/${locale}/products?${s}` : `/${locale}/products`;
}

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
  }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations();
  const page = Math.max(1, Number(sp.page || 1) || 1);

  let products: Product[] = [];
  let categories: { id?: string; slug: string; translations: Record<string, { name?: string }> }[] = [];
  let facets: { categories?: { category_id: string; count: number }[]; price_ranges?: { min: number; max: number }[] } =
    {};
  let total = 0;

  const qs = new URLSearchParams();
  qs.set("limit", String(PAGE_SIZE));
  qs.set("page", String(page));
  if (sp.sort) qs.set("sort", sp.sort);
  if (sp.min) qs.set("min_price", sp.min);
  if (sp.max) qs.set("max_price", sp.max);

  try {
    const [cats, facetData] = await Promise.all([
      api<{ items: typeof categories }>("/v1/categories"),
      api<typeof facets>("/v1/search/facets"),
    ]);
    categories = cats.items || [];
    facets = facetData || {};

    if (sp.q) {
      const prod = await api<{ items?: Product[]; result?: { hits?: { hits?: { _source?: Product }[] } }; total?: number }>(
        `/v1/search?q=${encodeURIComponent(sp.q)}&locale=${locale}&sort=${sp.sort || "relevance"}&page=${page}&limit=${PAGE_SIZE}`
      );
      products =
        prod.items ||
        (prod.result?.hits?.hits || [])
          .map((h) => h._source)
          .filter((p): p is Product => Boolean(p)) ||
        [];
      total = prod.total ?? products.length;
    } else if (sp.category) {
      const prod = await api<{ items: Product[]; total?: number }>(
        `/v1/categories/${sp.category}/products?${qs.toString()}`
      );
      products = prod.items || [];
      total = prod.total ?? products.length;
    } else {
      const prod = await api<{ items: Product[]; total?: number }>(`/v1/products?${qs.toString()}`);
      products = prod.items || [];
      total = prod.total ?? products.length;
    }
  } catch {
    products = [];
    total = 0;
  }

  return renderPage({
    locale,
    t,
    sp,
    categories,
    facets,
    products,
    page,
    total,
    pageSize: PAGE_SIZE,
  });
}

function renderPage({
  locale,
  t,
  sp,
  categories,
  facets,
  products,
  page,
  total,
  pageSize,
}: {
  locale: string;
  t: Awaited<ReturnType<typeof getTranslations>>;
  sp: { category?: string; sort?: string; min?: string; max?: string; q?: string; page?: string };
  categories: { id?: string; slug: string; translations: Record<string, { name?: string }> }[];
  facets: { categories?: { category_id: string; count: number }[]; price_ranges?: { min: number; max: number }[] };
  products: Product[];
  page: number;
  total: number;
  pageSize: number;
}) {
  const keep = {
    category: sp.category,
    sort: sp.sort,
    min: sp.min,
    max: sp.max,
    q: sp.q,
  };

  const activeCount =
    (sp.category ? 1 : 0) + (sp.min || sp.max ? 1 : 0) + (sp.sort ? 1 : 0);

  return (
    <div className="animate-rise lg:grid lg:grid-cols-[220px_1fr] lg:gap-10">
      <FilterSheet activeCount={activeCount}>
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{t("nav.categories")}</h2>
        <ul className="mt-2 space-y-1 text-sm">
          <li>
            <Link
              href={buildFilterHref(locale, { ...keep, category: undefined, page: undefined })}
              className={`block rounded-lg px-3 py-1.5 ${
                !sp.category ? "bg-accent-muted font-semibold text-teal" : "hover:bg-night/4"
              }`}
            >
              {t("catalog.all")}
            </Link>
          </li>
          {categories.map((c) => (
            <li key={c.slug}>
              <Link
                href={buildFilterHref(locale, { ...keep, category: c.slug, page: undefined })}
                className={`block rounded-lg px-3 py-1.5 ${
                  sp.category === c.slug
                    ? "bg-accent-muted font-semibold text-teal"
                    : "hover:bg-night/4"
                }`}
              >
                {c.translations?.[locale]?.name || c.slug}
              </Link>
            </li>
          ))}
        </ul>
        <h2 className="pt-2 text-sm font-bold uppercase tracking-wide text-muted">{t("catalog.price")}</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {(facets.price_ranges || [
            { min: 0, max: 100000 },
            { min: 100000, max: 500000 },
            { min: 500000, max: 2000000 },
          ]).map((r) => {
            const active = sp.min === String(r.min) && sp.max === String(r.max);
            return (
              <li key={`${r.min}-${r.max}`}>
                <Link
                  href={buildFilterHref(locale, {
                    ...keep,
                    min: String(r.min),
                    max: String(r.max),
                    page: undefined,
                  })}
                  className={`block rounded-lg px-3 py-1.5 ${
                    active ? "bg-accent-muted font-semibold text-teal" : "hover:bg-night/4"
                  }`}
                >
                  {r.min.toLocaleString()} – {r.max.toLocaleString()}
                </Link>
              </li>
            );
          })}
        </ul>
        {(sp.category || sp.min || sp.max || sp.sort) && (
          <Link
            href={`/${locale}/products`}
            className="inline-block text-sm font-semibold text-teal hover:underline"
          >
            {t("catalog.clearFilters")}
          </Link>
        )}
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
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1 text-sm sm:flex-wrap sm:overflow-visible">
          {[
            { sort: "price_asc", label: t("catalog.sortPriceAsc") },
            { sort: "price_desc", label: t("catalog.sortPriceDesc") },
            { sort: "newest", label: t("catalog.sortNewest") },
          ].map((s) => (
            <Link
              key={s.sort}
              href={buildFilterHref(locale, { ...keep, sort: s.sort })}
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
          basePath={`/${locale}/products`}
          page={page}
          pageSize={pageSize}
          total={total}
          params={keep}
        />
      </div>
    </div>
  );
}
