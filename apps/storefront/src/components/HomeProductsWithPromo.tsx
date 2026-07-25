"use client";

import { useEffect, useState } from "react";
import type { Product } from "@/lib/api";
import type { HeroSlide } from "@/components/HomeHero";
import { ProductGrid } from "@/components/ProductGrid";
import { PromoBanner } from "@/components/PromoBanner";

/** Column counts must match ProductGrid `columns={5}` breakpoints. */
function columnsForWidth(w: number) {
  if (w >= 1280) return 6; // xl
  if (w >= 1024) return 5; // lg
  if (w >= 768) return 4; // md
  if (w >= 640) return 3; // sm
  return 2;
}

export function HomeProductsWithPromo({
  products,
  locale,
  promoSlides,
  emptyLabel,
}: {
  products: Product[];
  locale: string;
  promoSlides: HeroSlide[];
  emptyLabel: string;
}) {
  const [cols, setCols] = useState(5);

  useEffect(() => {
    const queries = [
      window.matchMedia("(min-width: 1280px)"),
      window.matchMedia("(min-width: 1024px)"),
      window.matchMedia("(min-width: 768px)"),
      window.matchMedia("(min-width: 640px)"),
    ];
    function update() {
      setCols(columnsForWidth(window.innerWidth));
    }
    update();
    // matchMedia avoids iOS resize storms when the URL bar shows/hides on scroll
    for (const q of queries) {
      q.addEventListener("change", update);
    }
    return () => {
      for (const q of queries) {
        q.removeEventListener("change", update);
      }
    };
  }, []);

  if (products.length === 0) {
    return (
      <section className="home-section mt-6 sm:mt-8">
        <p className="mt-4 text-sm text-muted">{emptyLabel}</p>
        <PromoBanner slides={promoSlides} />
      </section>
    );
  }

  const firstCount = Math.max(cols * 2, 4);
  const first = products.slice(0, firstCount);
  const rest = products.slice(firstCount);

  return (
    <>
      <section className="home-section mt-6 sm:mt-8" aria-label="products">
        <ProductGrid products={first} locale={locale} columns={5} animate className="mt-0" />
      </section>

      <PromoBanner slides={promoSlides} />

      {rest.length > 0 ? (
        <section className="home-section mt-6 sm:mt-8" aria-label="products-more">
          <ProductGrid products={rest} locale={locale} columns={5} animate className="mt-0" />
        </section>
      ) : null}
    </>
  );
}
