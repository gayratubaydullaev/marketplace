import Link from "next/link";
import { setRequestLocale, getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { api, productName, type Product, type Variant } from "@/lib/api";
import { ProductReviews } from "@/components/ProductReviews";
import { ProductDetail } from "@/components/ProductDetail";
import { ProductGrid } from "@/components/ProductGrid";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  try {
    const data = await api<{ product: Product }>(`/v1/products/${slug}`);
    const name = productName(data.product, locale);
    const desc =
      data.product.translations?.[locale]?.description ||
      data.product.translations?.uz?.description ||
      "";
    const images = Array.isArray(data.product.images)
      ? data.product.images.filter((x): x is string => typeof x === "string")
      : [];
    return {
      title: `${name} | Gayrat Market`,
      description: desc.slice(0, 160),
      openGraph: {
        title: name,
        description: desc.slice(0, 160),
        images: images[0] ? [{ url: images[0] }] : undefined,
      },
      alternates: {
        languages: {
          uz: `/uz/products/${slug}`,
          ru: `/ru/products/${slug}`,
          en: `/en/products/${slug}`,
          ar: `/ar/products/${slug}`,
        },
      },
    };
  } catch {
    return { title: slug };
  }
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("product");
  const tn = await getTranslations("nav");

  let product: Product | null = null;
  let variants: Variant[] = [];
  let related: Product[] = [];
  let catalogJsonLd: Record<string, unknown> | null = null;
  try {
    const data = await api<{
      product: Product;
      variants?: Variant[];
      json_ld?: Record<string, unknown>;
    }>(`/v1/products/${slug}`);
    product = data.product;
    variants = data.variants || [];
    catalogJsonLd = data.json_ld || null;
    const rel = await api<{ items: Product[] }>(`/v1/products/${slug}/related`).catch(() => ({
      items: [] as Product[],
    }));
    related = rel.items || [];
  } catch {
    product = null;
  }

  if (!product) {
    const te = await getTranslations("errors");
    const tc = await getTranslations("common");
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <p className="text-lg font-semibold text-night">{te("notFound")}</p>
        <Link
          href={`/${locale}/products`}
          className="mt-6 inline-block rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-night"
        >
          {tn("catalog")}
        </Link>
        <Link href={`/${locale}`} className="mt-3 block text-sm text-night/55 hover:text-teal">
          {tc("goHome")}
        </Link>
      </div>
    );
  }

  const name = productName(product, locale);
  const description =
    product.translations?.[locale]?.description || product.translations?.uz?.description || "";
  const images = Array.isArray(product.images)
    ? product.images.filter((image): image is string => typeof image === "string")
    : [];
  const fallbackJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    description,
    image: images,
    offers: {
      "@type": "Offer",
      priceCurrency: "UZS",
      price: product.price,
      availability:
        (product.inventory_quantity ?? 1) > 0
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
    },
  };
  const jsonLd = catalogJsonLd || fallbackJsonLd;

  return (
    <div className="w-full min-w-0 max-w-full pb-[calc(var(--sticky-action-h)+1rem)] md:pb-10 lg:pb-14">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />

      <nav className="mb-4 flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-night/45 sm:mb-6 sm:text-sm lg:mb-8" aria-label="Breadcrumb">
        <Link href={`/${locale}`} className="hover:text-teal">
          {t("breadcrumbHome")}
        </Link>
        <span aria-hidden>/</span>
        <Link href={`/${locale}/products`} className="hover:text-teal">
          {tn("catalog")}
        </Link>
        <span aria-hidden>/</span>
        <span className="min-w-0 flex-1 truncate font-medium text-night/70">{name}</span>
      </nav>

      <ProductDetail product={product} variants={variants} locale={locale} name={name} />

      {description ? (
        <section className="mt-12 border-t border-night/8 pt-10 sm:mt-14 sm:pt-12 lg:mt-16 lg:pt-14">
          <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,0.7fr)] lg:gap-16 xl:gap-20">
            <div>
              <h2 className="font-display text-xl font-bold text-night sm:text-2xl">{t("description")}</h2>
              <div className="mt-4 max-w-3xl whitespace-pre-line text-sm leading-relaxed text-night/75 sm:text-[15px] lg:mt-5 lg:text-base lg:leading-7">
                {description}
              </div>
            </div>
            <aside className="mt-8 hidden rounded-2xl border border-night/8 bg-white/60 p-6 lg:mt-0 lg:block">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("deliverySoon")}</p>
              <ul className="mt-4 space-y-3 text-sm text-night/70">
                <li className="flex gap-2.5">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal" />
                  {t("trustDelivery")}
                </li>
                <li className="flex gap-2.5">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal" />
                  {t("trustReturn")}
                </li>
                <li className="flex gap-2.5">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal" />
                  {t("trustPayment")}
                </li>
              </ul>
            </aside>
          </div>
        </section>
      ) : null}

      <ProductReviews productId={product.id} locale={locale} />

      {related.length > 0 ? (
        <section className="mt-12 border-t border-night/8 pt-10 sm:mt-16 sm:pt-12 lg:mt-20 lg:pt-14">
          <h2 className="font-display text-xl font-bold text-night sm:text-2xl">{t("related")}</h2>
          <div className="mt-6 lg:mt-8">
            <ProductGrid products={related} locale={locale} columns={5} />
          </div>
        </section>
      ) : null}
    </div>
  );
}
