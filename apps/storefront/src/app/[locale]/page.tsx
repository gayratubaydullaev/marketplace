import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { api, type Product } from "@/lib/api";
import { HomeHero, type HeroSlide } from "@/components/HomeHero";
import { PromoBanner } from "@/components/PromoBanner";
import { ProductGrid } from "@/components/ProductGrid";

const HERO_IMAGES = {
  market:
    "https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?w=1920&q=85&auto=format&fit=crop",
  delivery:
    "https://images.unsplash.com/photo-1556740738-b6a63e27c4df?w=1920&q=85&auto=format&fit=crop",
  home:
    "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=1920&q=85&auto=format&fit=crop",
  promo:
    "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=1600&q=80&auto=format&fit=crop",
} as const;

type ApiHeroBanner = {
  id: string;
  image_url: string;
  headline?: string;
  sub?: string;
  cta_label?: string;
  cta_href?: string;
  cta2_label?: string;
  cta2_href?: string;
  show_brand?: boolean;
};

function localizeHref(href: string, locale: string): string {
  const value = href.trim();
  if (!value) return "";
  if (/^(https?:|mailto:|tel:|#)/i.test(value)) return value;
  if (/^\/(uz|ru|en|ar)(\/|$)/.test(value)) return value;
  if (value.startsWith("/")) return `/${locale}${value}`;
  return value;
}

function mapApiBanners(items: ApiHeroBanner[], locale: string): HeroSlide[] {
  return items
    .filter((b) => Boolean(b.image_url?.trim()))
    .map((b) => ({
      id: b.id,
      image: b.image_url,
      headline: b.headline?.trim() || undefined,
      sub: b.sub?.trim() || undefined,
      cta: b.cta_label?.trim() || undefined,
      href: b.cta_href ? localizeHref(b.cta_href, locale) : undefined,
      ctaSecondary: b.cta2_label?.trim() || undefined,
      hrefSecondary: b.cta2_href ? localizeHref(b.cta2_href, locale) : undefined,
      showBrand: b.show_brand !== false,
    }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const titles: Record<string, string> = {
    uz: "Gayrat Market — bosh sahifa",
    ru: "Gayrat Market — главная",
    en: "Gayrat Market — home",
    ar: "Gayrat Market — الرئيسية",
  };
  const descriptions: Record<string, string> = {
    uz: "O'zbekiston marketplace: elektronika, kiyim va uy-ro'zg'or.",
    ru: "Маркетплейс Узбекистана: электроника, одежда и товары для дома.",
    en: "Uzbekistan marketplace: electronics, fashion, and home goods.",
    ar: "سوق أوزبكستان: إلكترونيات وملابس ومنزل.",
  };
  return {
    title: titles[locale] || titles.uz,
    description: descriptions[locale] || descriptions.uz,
  };
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();

  let products: Product[] = [];
  let categories: { slug: string; translations: Record<string, { name?: string }> }[] = [];
  let showVendors = true;
  let cmsBanners: ApiHeroBanner[] = [];
  let cmsPromos: ApiHeroBanner[] = [];
  try {
    const [feat, cats, mode, banners, promos] = await Promise.all([
      api<{ items: Product[] }>("/v1/products?featured=true&limit=8").catch(() =>
        api<{ items: Product[] }>("/v1/products?limit=8")
      ),
      api<{ items: typeof categories }>("/v1/categories"),
      api<{ mode?: string }>("/v1/tenant/mode").catch(() => ({ mode: "multi_vendor" })),
      api<{ items: ApiHeroBanner[] }>("/v1/home/banners").catch(() => ({ items: [] })),
      api<{ items: ApiHeroBanner[] }>("/v1/home/promo-banners").catch(() => ({ items: [] })),
    ]);
    products = feat.items || [];
    categories = cats.items || [];
    showVendors = mode.mode !== "single_store";
    cmsBanners = banners.items || [];
    cmsPromos = promos.items || [];
  } catch {
    products = [];
  }

  const homeCategory =
    categories.find((c) => /uy|home|дом/i.test(c.slug) || /uy|home|дом/i.test(c.translations?.uz?.name || ""))
      ?.slug || categories[0]?.slug;

  const fallbackSlides: HeroSlide[] = [
    {
      id: "market",
      image: HERO_IMAGES.market,
      headline: t("home.slide1Headline"),
      sub: t("home.slide1Sub"),
      cta: t("home.cta"),
      href: `/${locale}/products`,
      ctaSecondary: showVendors ? t("home.ctaVendors") : undefined,
      hrefSecondary: showVendors ? `/${locale}/vendors` : undefined,
      showBrand: true,
    },
    {
      id: "delivery",
      image: HERO_IMAGES.delivery,
      headline: t("home.slide2Headline"),
      sub: t("home.slide2Sub"),
      cta: t("home.slide2Cta"),
      href: `/${locale}/products`,
      showBrand: true,
    },
    {
      id: "home",
      image: HERO_IMAGES.home,
      headline: t("home.slide3Headline"),
      sub: t("home.slide3Sub"),
      cta: t("home.slide3Cta"),
      href: homeCategory
        ? `/${locale}/categories/${homeCategory}`
        : `/${locale}/products`,
      showBrand: true,
    },
  ];

  const slides = mapApiBanners(cmsBanners, locale);
  const heroSlides = slides.length > 0 ? slides : fallbackSlides;
  const promoSlides = mapApiBanners(cmsPromos, locale);

  return (
    <div className="home-page">
      <HomeHero brand={t("brand")} slides={heroSlides} />

      {categories.length > 0 ? (
        <section className="home-section mt-14 sm:mt-16">
          <div className="flex items-end justify-between gap-4">
            <h2 className="font-display text-2xl font-bold tracking-tight text-night sm:text-3xl">
              {t("home.categoriesLead")}
            </h2>
            <Link
              href={`/${locale}/products`}
              className="shrink-0 text-sm font-semibold text-teal underline-offset-4 transition hover:underline"
            >
              {t("home.shopAll")}
            </Link>
          </div>
          <ul className="home-cat-rail mt-7 flex gap-3 overflow-x-auto pb-2 pe-4 sm:gap-4">
            {categories.map((c, i) => (
              <li key={c.slug} className="shrink-0" style={{ animationDelay: `${i * 50}ms` }}>
                <Link
                  href={`/${locale}/categories/${c.slug}`}
                  className="group relative flex h-24 w-36 items-end overflow-hidden rounded-xl px-3.5 py-3 sm:h-28 sm:w-44 sm:px-4"
                >
                  <span
                    className="absolute inset-0 bg-gradient-to-br from-teal/90 via-teal to-night transition duration-500 group-hover:scale-105"
                    aria-hidden
                  />
                  <span
                    className="absolute inset-0 opacity-0 transition duration-300 group-hover:opacity-100"
                    style={{
                      background:
                        "linear-gradient(135deg, rgba(232,168,56,0.35), transparent 60%)",
                    }}
                    aria-hidden
                  />
                  <span className="relative font-display text-base font-bold leading-tight text-paper sm:text-lg">
                    {c.translations?.[locale]?.name || c.slug}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {promoSlides.length > 0 ? (
        promoSlides.map((p) => (
          <PromoBanner
            key={p.id}
            title={p.headline}
            sub={p.sub}
            cta={p.cta}
            href={p.href}
            image={p.image}
          />
        ))
      ) : (
        <PromoBanner
          title={t("home.promoTitle")}
          sub={t("home.promoSub")}
          cta={t("home.promoCta")}
          href={`/${locale}/products`}
          image={HERO_IMAGES.promo}
        />
      )}

      <section className="home-section mt-16 sm:mt-20">
        <div className="flex items-end justify-between gap-4">
          <h2 className="font-display text-2xl font-bold tracking-tight text-night sm:text-3xl">
            {t("home.featured")}
          </h2>
          <Link
            href={`/${locale}/products`}
            className="shrink-0 text-sm font-semibold text-teal underline-offset-4 transition hover:underline"
          >
            {t("home.shopAll")}
          </Link>
        </div>

        {products.length === 0 ? (
          <p className="mt-8 text-sm text-muted">{t("common.emptyProducts")}</p>
        ) : (
          <ProductGrid
            products={products.slice(0, 8)}
            locale={locale}
            columns={5}
            animate
            className="mt-8"
          />
        )}
      </section>
    </div>
  );
}
