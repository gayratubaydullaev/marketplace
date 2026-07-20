import Link from "next/link";
import type { Metadata } from "next";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { api } from "@/lib/api";
import { EmptyState, PageHeader } from "@/components/PageChrome";

type Vendor = {
  id: string;
  name: string;
  slug: string;
  rating: number;
  description?: string;
  logo_url?: string | null;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "nav" });
  return {
    title: `${t("vendors")} — Gayrat`,
    description: t("vendors"),
  };
}

export default async function VendorsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  let items: Vendor[] = [];
  try {
    const data = await api<{ items: Vendor[] }>("/v1/vendors");
    items = [...(data.items || [])].sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0));
  } catch {
    items = [];
  }

  return (
    <div className="animate-rise">
      <PageHeader title={t("nav.vendors")} subtitle={t("vendors.sortedByRating")} />
      {items.length === 0 ? (
        <div className="mt-8">
          <EmptyState title={t("vendors.empty")} actionHref={`/${locale}/products`} actionLabel={t("nav.catalog")} />
        </div>
      ) : (
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((v) => (
            <Link
              key={v.id}
              href={`/${locale}/vendors/${v.slug}`}
              className="group flex gap-4 rounded-2xl border border-night/8 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition hover:border-accent/30 hover:shadow-md"
            >
              {v.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={v.logo_url} alt="" className="h-14 w-14 rounded-xl object-cover" />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-accent/10 text-lg font-bold text-teal">
                  {v.name.slice(0, 1)}
                </div>
              )}
              <div className="min-w-0">
                <h2 className="truncate text-lg font-bold text-night group-hover:text-teal">
                  {v.name}
                </h2>
                <p className="mt-1 flex items-center gap-1 text-sm text-[#8f8f8f]">
                  <svg width="12" height="12" viewBox="0 0 24 24" className="text-[#ffb800]" aria-hidden>
                    <path
                      fill="currentColor"
                      d="M12 2.5l2.9 6.1 6.6.7-4.9 4.5 1.4 6.5L12 16.9 5.9 20.3l1.4-6.5L2.5 9.3l6.6-.7L12 2.5z"
                    />
                  </svg>
                  {Number(v.rating || 0).toFixed(1)}
                </p>
                {v.description ? (
                  <p className="mt-2 line-clamp-2 text-sm text-night/55">{v.description}</p>
                ) : null}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
