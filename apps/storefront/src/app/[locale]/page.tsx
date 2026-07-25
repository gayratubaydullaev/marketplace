import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { api, type Product } from "@/lib/api";
import { HomeHero, type HeroSlide } from "@/components/HomeHero";
import { CategoryRail } from "@/components/CategoryRail";
import { HomeProductsWithPromo } from "@/components/HomeProductsWithPromo";

import { LOCAL_HERO_IMAGES, rewriteMediaUrl } from "@/lib/media";

const HERO_IMAGES = {
  market: LOCAL_HERO_IMAGES[0],
  delivery: LOCAL_HERO_IMAGES[1],
  home: LOCAL_HERO_IMAGES[2],
  promo: LOCAL_HERO_IMAGES[3],
} as const;

function localizeImageUrl(url: string, index = 0): string {
  return rewriteMediaUrl(url, { kind: "hero", fallbackKey: `hero:${index}:${url}` });
}

type ApiHeroBanner = {
  id: string;
  image_url: string;
  cta_href?: string;
  interval_sec?: number;
  starts_at?: string | null;
  ends_at?: string | null;
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
    .map((b, i) => {
      const sec = typeof b.interval_sec === "number" && b.interval_sec > 0 ? b.interval_sec : 6;
      return {
        id: b.id,
        image: localizeImageUrl(b.image_url, i),
        href: b.cta_href ? localizeHref(b.cta_href, locale) : undefined,
        intervalMs: sec * 1000,
      };
    });
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
  let categories: { slug: string; image_url?: string | null; translations: Record<string, { name?: string }> }[] = [];
  let cmsBanners: ApiHeroBanner[] = [];
  let cmsPromos: ApiHeroBanner[] = [];
  try {
    const [feat, cats, banners, promos] = await Promise.all([
      api<{ items: Product[] }>("/v1/products?featured=true&limit=18").catch(() =>
        api<{ items: Product[] }>("/v1/products?limit=18")
      ),
      api<{ items: typeof categories }>("/v1/categories"),
      api<{ items: ApiHeroBanner[] }>("/v1/home/banners").catch(() => ({ items: [] })),
      api<{ items: ApiHeroBanner[] }>("/v1/home/promo-banners").catch(() => ({ items: [] })),
    ]);
    products = feat.items || [];
    categories = cats.items || [];
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
      href: `/${locale}/products`,
      intervalMs: 6500,
    },
    {
      id: "delivery",
      image: HERO_IMAGES.delivery,
      href: `/${locale}/products`,
      intervalMs: 6500,
    },
    {
      id: "home",
      image: HERO_IMAGES.home,
      href: homeCategory
        ? `/${locale}/categories/${homeCategory}`
        : `/${locale}/products`,
      intervalMs: 6500,
    },
  ];

  const slides = mapApiBanners(cmsBanners, locale);
  const heroSlides = slides.length > 0 ? slides : fallbackSlides;
  const promoSlides = mapApiBanners(cmsPromos, locale);
  const promoFallback: HeroSlide[] = [
    {
      id: "promo-default",
      image: HERO_IMAGES.promo,
      href: `/${locale}/products`,
      intervalMs: 6500,
    },
  ];

  return (
    <div className="home-page">
      <HomeHero brand={t("brand")} slides={heroSlides} />

      {categories.length > 0 ? (
        <section className="home-section mt-6 sm:mt-8" aria-label={t("home.categoriesLead")}>
          <CategoryRail categories={categories} locale={locale} />
        </section>
      ) : null}

      <HomeProductsWithPromo
        products={products}
        locale={locale}
        promoSlides={promoSlides.length > 0 ? promoSlides : promoFallback}
        emptyLabel={t("common.emptyProducts")}
      />
    </div>
  );
}
