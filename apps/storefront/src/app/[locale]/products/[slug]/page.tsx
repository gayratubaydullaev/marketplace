import Link from "next/link";
import { setRequestLocale, getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { api, productName, type Product, type Variant } from "@/lib/api";
import { rewriteMediaUrls } from "@/lib/media";
import { ProductReviews } from "@/components/ProductReviews";
import { ProductDetail } from "@/components/ProductDetail";
import { ProductGrid } from "@/components/ProductGrid";
import { ProductInfoSection } from "@/components/ProductInfoSection";
import { EmptyState } from "@/components/PageChrome";

type CategoryItem = {
  id: string;
  slug: string;
  parent_id?: string | null;
  translations?: Record<string, { name?: string }>;
};

type VendorItem = {
  id: string;
  name: string;
  slug: string;
  logo_url?: string | null;
  rating?: number;
};

function catLabel(cat: CategoryItem | undefined, locale: string) {
  if (!cat) return "";
  return cat.translations?.[locale]?.name || cat.translations?.uz?.name || cat.slug;
}

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
    const images = rewriteMediaUrls(
      Array.isArray(data.product.images)
        ? data.product.images.filter((x): x is string => typeof x === "string")
        : [],
      { fallbackKey: data.product.id || slug }
    );
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
  let category: CategoryItem | null = null;
  let parentCategory: CategoryItem | null = null;
  let vendor: VendorItem | null = null;

  try {
    const data = await api<{
      product: Product;
      variants?: Variant[];
      json_ld?: Record<string, unknown>;
    }>(`/v1/products/${slug}`);
    product = data.product;
    variants = data.variants || [];
    catalogJsonLd = data.json_ld || null;

    const [rel, cats, vendors] = await Promise.all([
      api<{ items: Product[] }>(`/v1/products/${slug}/related`).catch(() => ({
        items: [] as Product[],
      })),
      api<{ items: CategoryItem[] }>("/v1/categories").catch(() => ({
        items: [] as CategoryItem[],
      })),
      product.vendor_id
        ? api<{ items: VendorItem[] }>("/v1/vendors").catch(() => ({
            items: [] as VendorItem[],
          }))
        : Promise.resolve({ items: [] as VendorItem[] }),
    ]);

    related = rel.items || [];
    const allCats = cats.items || [];
    if (product.category_id) {
      category = allCats.find((c) => c.id === product!.category_id) || null;
      if (category?.parent_id) {
        parentCategory = allCats.find((c) => c.id === category!.parent_id) || null;
      }
    }
    if (product.vendor_id) {
      vendor = (vendors.items || []).find((v) => v.id === product!.vendor_id) || null;
    }
  } catch {
    product = null;
  }

  if (!product) {
    const te = await getTranslations("errors");
    return (
      <EmptyState
        title={te("notFound")}
        description={t("notFoundHint")}
        actionHref={`/${locale}/products`}
        actionLabel={tn("catalog")}
      />
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
  const categoryName = category ? catLabel(category, locale) : null;
  const parentName = parentCategory ? catLabel(parentCategory, locale) : null;

  return (
    <div className="animate-rise w-full min-w-0 max-w-full pb-[calc(var(--sticky-action-h)+1rem)] md:pb-10 lg:pb-14">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />

      <nav
        className="mb-4 flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-night/45 sm:mb-6 sm:text-sm lg:mb-8"
        aria-label="Breadcrumb"
      >
        <Link href={`/${locale}`} className="shrink-0 transition hover:text-teal">
          {t("breadcrumbHome")}
        </Link>
        <span aria-hidden className="shrink-0 text-night/25">
          /
        </span>
        <Link href={`/${locale}/products`} className="shrink-0 transition hover:text-teal">
          {tn("catalog")}
        </Link>
        {parentCategory && parentName ? (
          <>
            <span aria-hidden className="shrink-0 text-night/25">
              /
            </span>
            <Link
              href={`/${locale}/categories/${parentCategory.slug}`}
              className="max-w-[10rem] truncate transition hover:text-teal sm:max-w-[14rem]"
            >
              {parentName}
            </Link>
          </>
        ) : null}
        {category && categoryName ? (
          <>
            <span aria-hidden className="shrink-0 text-night/25">
              /
            </span>
            <Link
              href={`/${locale}/categories/${category.slug}`}
              className="max-w-[10rem] truncate transition hover:text-teal sm:max-w-[14rem]"
            >
              {categoryName}
            </Link>
          </>
        ) : null}
        <span aria-hidden className="shrink-0 text-night/25">
          /
        </span>
        <span className="min-w-0 flex-1 truncate font-medium text-night/70">{name}</span>
      </nav>

      <ProductDetail
        product={product}
        variants={variants}
        locale={locale}
        name={name}
        vendorSlug={vendor?.slug}
        vendorName={vendor?.name}
        vendorLogo={vendor?.logo_url || undefined}
        vendorRating={vendor?.rating}
        info={
          <ProductInfoSection
            product={product}
            locale={locale}
            description={description}
            categoryName={categoryName}
            vendorName={vendor?.name}
          />
        }
      />

      <ProductReviews
        productId={product.id}
        productSlug={product.slug}
        vendorId={product.vendor_id}
        locale={locale}
        initialRating={typeof product.rating === "number" ? product.rating : null}
        initialCount={typeof product.review_count === "number" ? product.review_count : null}
      />

      {related.length > 0 ? (
        <section className="mt-12 border-t border-night/8 pt-10 sm:mt-16 sm:pt-12 lg:mt-20 lg:pt-14">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="font-display text-xl font-bold text-night sm:text-2xl">{t("related")}</h2>
            {category ? (
              <Link
                href={`/${locale}/categories/${category.slug}`}
                className="text-sm font-semibold text-teal transition hover:underline"
              >
                {t("seeCategory")}
              </Link>
            ) : null}
          </div>
          <div className="mt-6 lg:mt-8">
            <ProductGrid products={related} locale={locale} columns={4} />
          </div>
        </section>
      ) : null}
    </div>
  );
}
