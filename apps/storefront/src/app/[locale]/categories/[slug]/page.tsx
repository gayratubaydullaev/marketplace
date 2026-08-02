import Link from "next/link";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { apiPublic, publicTags, type Product } from "@/lib/api";
import { getCategories, getSearchFacets } from "@/lib/catalog";
import { buildFilterHref, countActiveFilters, type FilterState } from "@/lib/filters";
import { ProductGrid } from "@/components/ProductGrid";
import { CatalogError } from "@/components/CatalogError";
import { Pagination } from "@/components/Pagination";
import { FilterSheet } from "@/components/FilterSheet";
import { ActiveFilterChips, CatalogFilters } from "@/components/CatalogFilters";

const PAGE_SIZE = 24;

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  try {
    const cats = await getCategories();
    const cat = cats.find((c) => c.slug === slug);
    const name = cat?.translations?.[locale]?.name || cat?.translations?.uz?.name || slug;
    return {
      title: `${name} | Gayrat Market`,
      description: name,
      openGraph: { title: name },
    };
  } catch {
    return { title: slug };
  }
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{
    page?: string;
    sort?: string;
    min?: string;
    max?: string;
    featured?: string;
    on_sale?: string;
    in_stock?: string;
  }>;
}) {
  const { locale, slug } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations();
  const page = Math.max(1, Number(sp.page || 1) || 1);

  let products: Product[] = [];
  let total = 0;
  let loadError = false;
  let categoryName = slug;
  let parentSlug: string | null = null;
  let parentName: string | null = null;
  let childLinks: { slug: string; name: string }[] = [];
  let priceRanges: { min: number; max: number }[] | undefined;

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
    const [all, prod, facets] = await Promise.all([
      getCategories(),
      apiPublic<{ items: Product[]; total?: number }>(`/v1/categories/${slug}/products?${qs.toString()}`, {
        revalidate: 60,
        tags: publicTags("products"),
      }),
      getSearchFacets(),
    ]);
    const cat = all.find((c) => c.slug === slug);
    categoryName = cat?.translations?.[locale]?.name || cat?.translations?.uz?.name || slug;
    products = prod.items || [];
    total = prod.total ?? products.length;
    priceRanges = facets.price_ranges;
    const parent = cat?.parent_id ? all.find((c) => c.id === cat.parent_id) : null;
    if (parent) {
      parentSlug = parent.slug;
      parentName = parent.translations?.[locale]?.name || parent.translations?.uz?.name || parent.slug;
    }
    childLinks = all
      .filter((c) => Boolean(cat && c.parent_id === cat.id))
      .map((c) => ({
        slug: c.slug,
        name: c.translations?.[locale]?.name || c.translations?.uz?.name || c.slug,
      }));
  } catch {
    products = [];
    loadError = true;
  }

  const values: FilterState = {
    sort: sp.sort,
    min: sp.min,
    max: sp.max,
    featured: sp.featured ? "1" : undefined,
    on_sale: sp.on_sale ? "1" : undefined,
    in_stock: sp.in_stock ? "1" : undefined,
  };
  const basePath = `/${locale}/categories/${slug}`;
  const activeCount = countActiveFilters(values, { ignoreSort: true });

  return (
    <div className="animate-rise lg:grid lg:grid-cols-[minmax(12.5rem,15rem)_minmax(0,1fr)] lg:gap-8 xl:grid-cols-[minmax(14rem,16rem)_minmax(0,1fr)] xl:gap-12">
      <FilterSheet activeCount={activeCount} resultCount={total} clearHref={basePath}>
        <CatalogFilters
          locale={locale}
          basePath={basePath}
          values={values}
          mode="category"
          priceRanges={priceRanges}
          showCategories={false}
        />
      </FilterSheet>
      <div>
        <nav className="flex flex-wrap items-center gap-1.5 text-xs text-muted sm:text-sm">
          <Link href={`/${locale}/products`} className="hover:text-teal">
            {t("nav.catalog")}
          </Link>
          {parentSlug && parentName ? (
            <>
              <span>/</span>
              <Link href={`/${locale}/categories/${parentSlug}`} className="hover:text-teal">
                {parentName}
              </Link>
            </>
          ) : null}
          <span>/</span>
          <span className="font-medium text-night/70">{categoryName}</span>
        </nav>
        <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-night sm:text-3xl">
          {categoryName}
        </h1>
        <p className="mt-1 text-sm text-muted">{t("catalog.found", { count: total })}</p>
        {childLinks.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {childLinks.map((c) => (
              <Link
                key={c.slug}
                href={`/${locale}/categories/${c.slug}`}
                className="rounded-full border border-night/10 bg-white px-3.5 py-1.5 text-sm font-semibold text-night/80 transition hover:border-teal/40 hover:text-teal"
              >
                {c.name}
              </Link>
            ))}
          </div>
        ) : null}

        <div className="mt-4">
          <ActiveFilterChips locale={locale} basePath={basePath} values={values} clearHref={basePath} />
        </div>

        <div className="mt-2 flex gap-2 overflow-x-auto pb-1 text-sm">
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
              className={`shrink-0 rounded-full px-3.5 py-1.5 font-medium ${
                sp.sort === s.sort
                  ? "bg-accent text-night"
                  : "border border-night/10 bg-white hover:border-accent/40"
              }`}
            >
              {s.label}
            </Link>
          ))}
        </div>
        {loadError ? <CatalogError /> : <ProductGrid products={products} locale={locale} columns={4} />}
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
