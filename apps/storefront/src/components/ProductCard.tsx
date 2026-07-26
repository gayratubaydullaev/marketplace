"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { useTranslations } from "next-intl";
import { formatUZS, type Locale } from "@gayrat/i18n";
import { api, productBadges, productCompareAt, productDiscountPercent, productName, variantImageList, type Product, type Variant } from "@/lib/api";
import { rewriteMediaUrls } from "@/lib/media";
import { useCart, ensureCartHydrated } from "@/lib/cart";
import { WishlistButton } from "@/components/WishlistButton";
import { ProductShareButton } from "@/components/ProductShareButton";
import { VariantSelectModal } from "@/components/VariantSelectModal";
import { track, trackImpressionOnce } from "@/lib/track";
import type { VendorInfo } from "@/lib/vendors";

function productImages(p: Product): string[] {
  if (!Array.isArray(p.images)) return [];
  return rewriteMediaUrls(
    p.images.filter((x): x is string => typeof x === "string"),
    { fallbackKey: p.id || p.slug }
  );
}

export function ProductCard({
  product,
  locale,
  index = 0,
  animate,
  vendor,
}: {
  product: Product;
  locale: string;
  index?: number;
  animate?: boolean;
  vendor?: VendorInfo;
}) {
  const t = useTranslations("product");
  const add = useCart((s) => s.add);
  const [added, setAdded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [imgIndex, setImgIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [variants, setVariants] = useState<Variant[]>([]);
  const rootRef = useRef<HTMLElement>(null);

  const name = productName(product, locale);

  useEffect(() => {
    return trackImpressionOnce(rootRef.current, "product_impression", product.id, {
      slug: product.slug,
      source: "card",
    });
  }, [product.id, product.slug]);
  const images = productImages(product);
  const img = images[hovered && images.length > 1 ? Math.min(imgIndex, images.length - 1) : 0];
  const stock = product.inventory_quantity;
  const outOfStock = typeof stock === "number" && stock <= 0;
  const compare = productCompareAt(product);
  const discount = productDiscountPercent(product);
  const rating = typeof product.rating === "number" ? product.rating : null;
  const reviews =
    typeof product.review_count === "number" && product.review_count > 0
      ? product.review_count
      : null;
  const badges = productBadges(product);

  function flashAdded() {
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1600);
  }

  function addLine(variant: Variant | null) {
    const unitPrice = variant?.price ?? product.price;
    const image = (variant && variantImageList(variant)[0]) || images[0];
    add({
      product_id: product.id,
      variant_id: variant?.id,
      vendor_id: product.vendor_id || undefined,
      title: variant ? `${name} — ${variant.title || variant.sku || ""}` : name,
      unit_price: unitPrice,
      quantity: 1,
      slug: product.slug,
      image,
    });
    track("add_to_cart", product.id, {
      slug: product.slug,
      variant_id: variant?.id || "",
      source: "card",
    });
    flashAdded();
  }

  async function onAdd(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (outOfStock || added || loading) return;

    setLoading(true);
    try {
      await ensureCartHydrated();

      let list: Variant[] = [];
      try {
        const data = await api<{ variants?: Variant[] | null }>(`/v1/products/${product.slug}`);
        list = Array.isArray(data.variants) ? data.variants : [];
      } catch {
        // API hiccup must not block cart on mobile — add base SKU.
        addLine(null);
        return;
      }

      if (list.length > 0) {
        setVariants(list);
        setModalOpen(true);
        return;
      }
      addLine(null);
    } finally {
      setLoading(false);
    }
  }

  function onModalConfirm(variantId: string) {
    const variant = variants.find((v) => v.id === variantId) || null;
    if (!variant) return;
    setModalOpen(false);
    addLine(variant);
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
      ref={rootRef}
      className={`group relative flex flex-col home-product-card ${animate ? "product-card-enter" : ""}`}
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
          onClick={() =>
            track("product_click", product.id, { slug: product.slug, source: "card" })
          }
        >
          <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-surface-muted">
            {img ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={img}
                alt={name}
                loading="lazy"
                decoding="async"
                width={600}
                height={800}
                sizes="(max-width: 639px) 50vw, (max-width: 1023px) 33vw, (max-width: 1279px) 25vw, 20vw"
                className={`h-full w-full object-cover ${
                  outOfStock ? "opacity-50" : "md:transition md:duration-300 md:group-hover:scale-[1.03]"
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

            {badges.length > 0 ? (
              <div className="pointer-events-none absolute start-2 top-2 z-[2] flex max-w-[70%] flex-col items-start gap-1">
                {badges.map((badge) => {
                  const label =
                    badge.kind === "sale" && badge.percent != null
                      ? t("badgeSale", { percent: badge.percent })
                      : t(badge.labelKey);
                  const style =
                    badge.kind === "sale"
                      ? "bg-danger text-white"
                      : badge.kind === "new"
                        ? "bg-teal text-paper"
                        : badge.kind === "hit"
                          ? "bg-saffron text-night"
                          : "bg-night/80 text-paper";
                  return (
                    <span
                      key={badge.kind}
                      className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide shadow-sm sm:text-[11px] ${style}`}
                    >
                      {label}
                    </span>
                  );
                })}
              </div>
            ) : null}

            {outOfStock ? (
              <span className="absolute bottom-3 start-3 rounded bg-night/75 px-2 py-1 text-[11px] font-semibold text-white">
                {t("outOfStock")}
              </span>
            ) : null}
          </div>
        </Link>

        <div className="absolute end-2 top-2 z-10 flex flex-col gap-1.5">
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
          <ProductShareButton title={name} url={`/${locale}/products/${product.slug}`} />
        </div>
      </div>

      {/* Meta: price → name → vendor → add to cart */}
      <div className="mt-1.5 flex flex-1 flex-col px-0.5 sm:mt-2">
        <Link href={`/${locale}/products/${product.slug}`} className="block">
          <div className="flex flex-col gap-0.5">
            {/* Fixed-height row so neighboring cards without sale stay aligned */}
            <div className="flex h-[14px] min-w-0 items-center gap-1 overflow-hidden sm:h-[15px]">
              {compare != null ? (
                <span className="truncate text-[12px] leading-none text-muted line-through sm:text-[13px]">
                  {formatUZS(compare, locale as Locale)}
                </span>
              ) : (
                <span className="invisible select-none text-[12px] leading-none sm:text-[13px]" aria-hidden>
                  —
                </span>
              )}
            </div>
            <div className="flex min-w-0 flex-nowrap items-center gap-1.5 overflow-hidden">
              <span className="shrink-0 text-[15px] font-bold leading-none tracking-tight text-night sm:text-base">
                {formatUZS(product.price, locale as Locale)}
              </span>
              {discount > 0 ? (
                <span className="shrink-0 rounded bg-danger-muted px-1 py-0.5 text-[11px] font-bold leading-none text-danger sm:text-xs">
                  −{discount}%
                </span>
              ) : null}
            </div>
          </div>

          <h3 className="mt-1 line-clamp-2 text-[13px] font-medium leading-snug text-night/85 sm:mt-1.5 sm:text-sm">
            {name}
          </h3>
        </Link>

        {vendor || rating != null || reviews != null ? (
          <div className="mt-0.5 flex min-w-0 items-center gap-1 text-[12px] leading-tight text-muted sm:mt-1">
            {vendor ? (
              <Link
                href={`/${locale}/vendors/${vendor.slug}`}
                className="min-w-0 truncate font-medium text-night/70 transition hover:text-teal"
                onClick={(e) => e.stopPropagation()}
              >
                {vendor.name}
              </Link>
            ) : null}
            {(rating != null || reviews != null) && (
              <>
                {vendor ? (
                  <span className="shrink-0 text-night/25" aria-hidden>
                    ·
                  </span>
                ) : null}
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  className="shrink-0 text-saffron"
                  aria-hidden
                >
                  <path
                    fill="currentColor"
                    d="M12 2.5l2.9 6.1 6.6.7-4.9 4.5 1.4 6.5L12 16.9 5.9 20.3l1.4-6.5L2.5 9.3l6.6-.7L12 2.5z"
                  />
                </svg>
                {rating != null ? (
                  <span className="shrink-0 font-semibold tabular-nums text-night/75">
                    {rating.toFixed(1)}
                  </span>
                ) : null}
                {reviews != null ? (
                  <span className="shrink-0 tabular-nums">
                    ({reviews})
                  </span>
                ) : null}
              </>
            )}
          </div>
        ) : null}

        {!outOfStock ? (
          <button
            type="button"
            onClick={onAdd}
            onPointerDown={(e) => e.stopPropagation()}
            disabled={loading}
            className={`relative z-[1] mt-1.5 w-full touch-manipulation rounded-xl py-2 text-sm font-bold text-night transition disabled:opacity-60 sm:mt-2 sm:py-2.5 ${
              added ? "bg-teal text-paper" : "bg-accent hover:bg-accent-hover"
            }`}
          >
            {added ? t("addedToCart") : loading ? "…" : t("addToCart")}
          </button>
        ) : null}
      </div>

      <VariantSelectModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        product={product}
        variants={variants}
        locale={locale}
        name={name}
        productImages={images}
        intent="add"
        onConfirm={onModalConfirm}
      />
    </article>
  );
}
