import { setRequestLocale, getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { api, type Product } from "@/lib/api";
import { ProductGrid } from "@/components/ProductGrid";
import { Pagination } from "@/components/Pagination";

const PAGE_SIZE = 12;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  try {
    const vendor = await api<{ name: string; description?: string }>(`/v1/vendors/${slug}`);
    return {
      title: `${vendor.name} — Gayrat`,
      description: vendor.description || (locale === "ru" ? `Магазин ${vendor.name}` : `${vendor.name} do'koni`),
    };
  } catch {
    return { title: slug };
  }
}

function policiesBlocks(policies: unknown): { label?: string; text: string }[] {
  if (!policies) return [];
  if (typeof policies === "string") return [{ text: policies }];
  if (typeof policies === "object" && policies !== null) {
    return Object.entries(policies as Record<string, unknown>).map(([k, v]) => ({
      label: k,
      text: typeof v === "string" ? v : Array.isArray(v) ? v.join(", ") : JSON.stringify(v),
    }));
  }
  return [{ text: String(policies) }];
}

export default async function VendorPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { locale, slug } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations();
  const page = Math.max(1, Number(sp.page || 1) || 1);

  let vendor: {
    name: string;
    description?: string;
    rating: number;
    logo_url?: string | null;
    policies?: unknown;
  } | null = null;
  let products: Product[] = [];
  let reviews: { id: string; rating: number; title?: string; body?: string }[] = [];
  try {
    vendor = await api(`/v1/vendors/${slug}`);
    const [prod, rev] = await Promise.all([
      api<{ items: Product[] }>(`/v1/vendors/${slug}/products`),
      api<{ items: typeof reviews }>(`/v1/vendors/${slug}/reviews`),
    ]);
    products = prod.items || [];
    reviews = rev.items || [];
  } catch {
    vendor = null;
  }
  if (!vendor) {
    const tErr = await getTranslations("errors");
    return <p className="py-12 text-center text-night/60">{tErr("notFound")}</p>;
  }

  const start = (page - 1) * PAGE_SIZE;
  const pageItems = products.slice(start, start + PAGE_SIZE);
  const policyBlocks = policiesBlocks(vendor.policies);

  return (
    <div className="animate-rise">
      <div className="overflow-hidden rounded-2xl border border-night/8 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="flex flex-wrap items-start gap-5 p-5 sm:p-6">
          {vendor.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={vendor.logo_url}
              alt=""
              className="h-20 w-20 rounded-2xl object-cover sm:h-24 sm:w-24"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-accent/10 text-3xl font-bold text-teal sm:h-24 sm:w-24">
              {vendor.name.slice(0, 1)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold tracking-tight text-night sm:text-3xl">{vendor.name}</h1>
            <p className="mt-2 flex items-center gap-1.5 text-sm text-night/60">
              <svg width="14" height="14" viewBox="0 0 24 24" className="text-[#ffb800]" aria-hidden>
                <path
                  fill="currentColor"
                  d="M12 2.5l2.9 6.1 6.6.7-4.9 4.5 1.4 6.5L12 16.9 5.9 20.3l1.4-6.5L2.5 9.3l6.6-.7L12 2.5z"
                />
              </svg>
              {vendor.rating?.toFixed?.(1)}
            </p>
            {vendor.description ? (
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-night/65">{vendor.description}</p>
            ) : null}
          </div>
        </div>
      </div>

      {policyBlocks.length > 0 && (
        <section className="mt-8 rounded-2xl border border-night/8 bg-white p-5 sm:p-6">
          <h2 className="text-lg font-bold text-night">{t("vendors.policies")}</h2>
          <div className="mt-3 space-y-3 text-sm text-night/70">
            {policyBlocks.map((b, i) => (
              <div key={i}>
                {b.label ? <p className="font-semibold capitalize text-night">{b.label}</p> : null}
                <p className="whitespace-pre-wrap">{b.text}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <h2 className="mt-12 text-xl font-bold text-night sm:text-2xl">{t("nav.catalog")}</h2>
      <ProductGrid products={pageItems} locale={locale} columns={5} />
      <Pagination
        locale={locale}
        basePath={`/${locale}/vendors/${slug}`}
        page={page}
        pageSize={PAGE_SIZE}
        total={products.length}
      />

      <h2 className="mt-12 text-xl font-bold text-night sm:text-2xl">{t("product.reviews")}</h2>
      <ul className="mt-4 space-y-3">
        {reviews.map((r) => (
          <li key={r.id} className="rounded-2xl border border-night/8 bg-white p-4">
            <p className="font-semibold text-night">
              ★ {r.rating} {r.title}
            </p>
            <p className="mt-1 text-sm text-night/65">{r.body}</p>
          </li>
        ))}
        {reviews.length === 0 && (
          <p className="rounded-2xl border border-dashed border-night/12 px-4 py-8 text-center text-sm text-night/50">
            {t("vendors.noReviews")}
          </p>
        )}
      </ul>
    </div>
  );
}
