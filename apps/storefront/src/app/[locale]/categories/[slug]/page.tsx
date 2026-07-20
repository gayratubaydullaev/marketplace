import Link from "next/link";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { api, type Product } from "@/lib/api";
import { ProductGrid } from "@/components/ProductGrid";
import { Pagination } from "@/components/Pagination";
import { FilterSheet } from "@/components/FilterSheet";

const PAGE_SIZE = 12;

function buildHref(locale: string, slug: string, next: Record<string, string | undefined>) {
  const q = new URLSearchParams();
  Object.entries(next).forEach(([k, v]) => {
    if (v) q.set(k, v);
  });
  const s = q.toString();
  return s ? `/${locale}/categories/${slug}?${s}` : `/${locale}/categories/${slug}`;
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  try {
    const cats = await api<{ items: { slug: string; translations?: Record<string, { name?: string }> }[] }>(
      "/v1/categories"
    );
    const cat = (cats.items || []).find((c) => c.slug === slug);
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
  searchParams: Promise<{ page?: string; sort?: string; min?: string; max?: string }>;
}) {
  const { locale, slug } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations();
  const page = Math.max(1, Number(sp.page || 1) || 1);

  let products: Product[] = [];
  let total = 0;
  let categoryName = slug;

  const qs = new URLSearchParams();
  qs.set("limit", String(PAGE_SIZE));
  qs.set("page", String(page));
  if (sp.sort) qs.set("sort", sp.sort);
  if (sp.min) qs.set("min_price", sp.min);
  if (sp.max) qs.set("max_price", sp.max);

  try {
    const [cats, prod] = await Promise.all([
      api<{ items: { slug: string; translations?: Record<string, { name?: string }> }[] }>("/v1/categories"),
      api<{ items: Product[]; total?: number }>(`/v1/categories/${slug}/products?${qs.toString()}`),
    ]);
    const cat = (cats.items || []).find((c) => c.slug === slug);
    categoryName = cat?.translations?.[locale]?.name || cat?.translations?.uz?.name || slug;
    products = prod.items || [];
    total = prod.total ?? products.length;
  } catch {
    products = [];
  }

  const keep = { sort: sp.sort, min: sp.min, max: sp.max };
  const activeCount = (sp.min || sp.max ? 1 : 0) + (sp.sort ? 1 : 0);

  return (
    <div className="animate-rise lg:grid lg:grid-cols-[220px_1fr] lg:gap-10">
      <FilterSheet activeCount={activeCount}>
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{t("catalog.price")}</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {[
            { min: 0, max: 100000 },
            { min: 100000, max: 500000 },
            { min: 500000, max: 2000000 },
          ].map((r) => {
            const active = sp.min === String(r.min) && sp.max === String(r.max);
            return (
              <li key={`${r.min}-${r.max}`}>
                <Link
                  href={buildHref(locale, slug, {
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
        {(sp.min || sp.max || sp.sort) && (
          <Link
            href={`/${locale}/categories/${slug}`}
            className="inline-block text-sm font-semibold text-teal hover:underline"
          >
            {t("catalog.clearFilters")}
          </Link>
        )}
      </FilterSheet>
      <div>
        <nav className="flex flex-wrap items-center gap-1.5 text-xs text-muted sm:text-sm">
          <Link href={`/${locale}/products`} className="hover:text-teal">
            {t("nav.catalog")}
          </Link>
          <span>/</span>
          <span className="font-medium text-night/70">{categoryName}</span>
        </nav>
        <h1 className="mt-2 font-display text-2xl font-bold tracking-tight text-night sm:text-3xl">
          {categoryName}
        </h1>
        <p className="mt-1 text-sm text-muted">{t("catalog.found", { count: total })}</p>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1 text-sm">
          {[
            { sort: "price_asc", label: t("catalog.sortPriceAsc") },
            { sort: "price_desc", label: t("catalog.sortPriceDesc") },
            { sort: "newest", label: t("catalog.sortNewest") },
          ].map((s) => (
            <Link
              key={s.sort}
              href={buildHref(locale, slug, { ...keep, sort: s.sort })}
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
        <ProductGrid products={products} locale={locale} columns={5} />
        <Pagination
          locale={locale}
          basePath={`/${locale}/categories/${slug}`}
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          params={keep}
        />
      </div>
    </div>
  );
}
