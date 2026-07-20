"use client";

import Link from "next/link";
import { useState, type CSSProperties, type MouseEvent } from "react";
import { useTranslations } from "next-intl";
import { formatUZS, type Locale } from "@gayrat/i18n";
import { productName, type Product } from "@/lib/api";
import { useCart } from "@/lib/cart";
import { WishlistButton } from "@/components/WishlistButton";

function productImages(p: Product): string[] {
  if (!Array.isArray(p.images)) return [];
  return p.images.filter((x): x is string => typeof x === "string");
}

export function ProductCard({
  product,
  locale,
  index = 0,
  animate,
}: {
  product: Product;
  locale: string;
  index?: number;
  animate?: boolean;
}) {
  const t = useTranslations("product");
  const add = useCart((s) => s.add);
  const [added, setAdded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [imgIndex, setImgIndex] = useState(0);

  const name = productName(product, locale);
  const images = productImages(product);
  const img = images[hovered && images.length > 1 ? Math.min(imgIndex, images.length - 1) : 0];
  const stock = product.inventory_quantity;
  const outOfStock = typeof stock === "number" && stock <= 0;
  const compare =
    typeof product.compare_at_price === "number" && product.compare_at_price > product.price
      ? product.compare_at_price
      : null;
  const discount =
    compare != null ? Math.round((1 - product.price / compare) * 100) : 0;
  const rating = typeof product.rating === "number" ? product.rating : null;
  const reviews =
    typeof product.review_count === "number" && product.review_count > 0
      ? product.review_count
      : null;

  function onAdd(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (outOfStock || added) return;
    add({
      product_id: product.id,
      vendor_id: product.vendor_id || undefined,
      title: name,
      unit_price: product.price,
      quantity: 1,
      slug: product.slug,
      image: images[0],
    });
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1600);
  }

  function onMove(e: MouseEvent<HTMLAnchorElement>) {
    if (images.length < 2) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const slot = Math.min(images.length - 1, Math.max(0, Math.floor((x / rect.width) * images.length)));
    setImgIndex(slot);
  }

  return (
    <article
      className={`group relative flex flex-col ${animate ? "product-card-enter" : ""}`}
      style={animate ? ({ "--i": index } as CSSProperties) : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        setImgIndex(0);
      }}
    >
      <div className="relative">
        <Link
          href={`/${locale}/products/${product.slug}`}
          className="block"
          tabIndex={-1}
          onMouseMove={onMove}
        >
          <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-surface-muted">
            {img ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={img}
                alt={name}
                loading="lazy"
                className={`h-full w-full object-cover transition duration-300 group-hover:scale-[1.03] ${
                  outOfStock ? "opacity-50" : ""
                }`}
              />
            ) : (
              <div className="flex h-full w-full items-end bg-gradient-to-br from-teal/15 to-mist p-4">
                <span className="font-display text-3xl font-bold leading-none text-night/15">
                  {name.slice(0, 1).toUpperCase()}
                </span>
              </div>
            )}

            {images.length > 1 ? (
              <div className="pointer-events-none absolute inset-x-2 top-2 z-[1] flex gap-0.5 opacity-0 transition group-hover:opacity-100">
                {images.slice(0, 5).map((_, i) => (
                  <span
                    key={i}
                    className={`h-0.5 flex-1 rounded-full ${
                      i === imgIndex ? "bg-white" : "bg-white/40"
                    }`}
                  />
                ))}
              </div>
            ) : null}

            {outOfStock ? (
              <span className="absolute bottom-3 start-3 rounded bg-night/75 px-2 py-1 text-[11px] font-semibold text-white">
                {t("outOfStock")}
              </span>
            ) : null}
          </div>
        </Link>

        <div className="absolute end-2 top-2 z-10">
          <WishlistButton
            variant="wb"
            product={{
              id: product.id,
              slug: product.slug,
              title: name,
              price: product.price,
              image: images[0],
            }}
          />
        </div>
      </div>

      {/* Meta: price → name → delivery → add to cart */}
      <div className="mt-2 flex flex-1 flex-col px-0.5 sm:mt-2.5">
        <Link href={`/${locale}/products/${product.slug}`} className="block">
          <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
            <span className="text-[15px] font-bold leading-none tracking-tight text-night sm:text-base">
              {formatUZS(product.price, locale as Locale)}
            </span>
            {compare != null ? (
              <span className="text-xs text-muted line-through sm:text-[13px]">
                {formatUZS(compare, locale as Locale)}
              </span>
            ) : null}
            {discount > 0 ? (
              <span className="text-xs font-semibold text-danger sm:text-[13px]">−{discount}%</span>
            ) : null}
          </div>

          <h3 className="mt-1.5 line-clamp-2 text-[13px] font-medium leading-snug text-night/85 sm:text-sm">
            {name}
          </h3>

          {(rating != null || reviews != null) && (
            <div className="mt-1.5 flex items-center gap-1 text-[12px] text-muted">
              <svg width="12" height="12" viewBox="0 0 24 24" className="shrink-0 text-saffron" aria-hidden>
                <path
                  fill="currentColor"
                  d="M12 2.5l2.9 6.1 6.6.7-4.9 4.5 1.4 6.5L12 16.9 5.9 20.3l1.4-6.5L2.5 9.3l6.6-.7L12 2.5z"
                />
              </svg>
              {rating != null ? (
                <span className="font-medium text-night/80">{rating.toFixed(1)}</span>
              ) : null}
              {reviews != null ? (
                <span>
                  ·{" "}
                  {reviews === 1
                    ? t("reviewsCountOne", { count: reviews })
                    : t("reviewsCount", { count: reviews })}
                </span>
              ) : null}
            </div>
          )}

          {!outOfStock ? (
            <p className="mt-1 text-[12px] font-medium text-teal">{t("deliverySoon")}</p>
          ) : null}
        </Link>

        {!outOfStock ? (
          <button
            type="button"
            onClick={onAdd}
            className={`mt-2 w-full rounded-xl py-2.5 text-sm font-bold text-night transition sm:py-2.5 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 focus-visible:opacity-100 ${
              added ? "bg-teal text-paper opacity-100" : "bg-accent hover:bg-accent-hover"
            }`}
          >
            {added ? t("addedToCart") : t("addToCart")}
          </button>
        ) : null}
      </div>
    </article>
  );
}
