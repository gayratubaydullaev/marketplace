"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { formatUZS, type Locale } from "@gayrat/i18n";
import type { Product, Variant } from "@/lib/api";
import { productBadges, variantImageList } from "@/lib/api";
import { useCart, ensureCartHydrated } from "@/lib/cart";
import { WishlistButton } from "@/components/WishlistButton";
import { ProductShareButton } from "@/components/ProductShareButton";
import { MobileStickyPortal } from "@/components/MobileStickyPortal";
import { VariantPicker } from "@/components/VariantPicker";
import {
  VariantSelectModal,
  type VariantSelectIntent,
} from "@/components/VariantSelectModal";
import { track } from "@/lib/track";
import { rewriteMediaUrl } from "@/lib/media";

export function ProductPurchase({
  product,
  variants,
  locale,
  name,
  vendorSlug,
  vendorName,
  vendorLogo,
  vendorRating,
  variantId,
  onVariantChange,
  galleryImages,
  productImages,
}: {
  product: Product;
  variants: Variant[];
  locale: string;
  name: string;
  vendorSlug?: string;
  vendorName?: string;
  vendorLogo?: string;
  vendorRating?: number;
  variantId: string;
  onVariantChange: (id: string) => void;
  galleryImages: string[];
  productImages: string[];
}) {
  const t = useTranslations("product");
  const router = useRouter();
  const add = useCart((s) => s.add);
  const setCartQty = useCart((s) => s.setQty);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalIntent, setModalIntent] = useState<VariantSelectIntent>("add");

  useEffect(() => {
    track("product_view", product.id, { slug: product.slug, source: "pdp" });
  }, [product.id, product.slug]);

  const selected = useMemo(
    () => variants.find((v) => v.id === variantId) || null,
    [variants, variantId]
  );
  const hasVariants = variants.length > 0;
  const needsVariant = hasVariants && !variantId;
  const anyVariantInStock = hasVariants
    ? variants.some((v) => typeof v.inventory_quantity !== "number" || (v.inventory_quantity ?? 0) > 0)
    : true;
  const price = selected?.price ?? product.price;
  const stock = selected
    ? selected.inventory_quantity
    : hasVariants
      ? undefined
      : product.inventory_quantity;
  const inStock = selected
    ? typeof stock !== "number" || stock > 0
    : hasVariants
      ? anyVariantInStock
      : typeof product.inventory_quantity !== "number" || (product.inventory_quantity ?? 0) > 0;
  const maxQty = typeof stock === "number" && stock > 0 ? Math.min(stock, 99) : 99;
  const cover = (selected && variantImageList(selected)[0]) || galleryImages[0];
  const compare =
    typeof product.compare_at_price === "number" && product.compare_at_price > price
      ? product.compare_at_price
      : null;
  const discount = compare != null ? Math.round((1 - price / compare) * 100) : 0;
  const rating = typeof product.rating === "number" ? product.rating : null;
  const reviews =
    typeof product.review_count === "number" && product.review_count > 0
      ? product.review_count
      : null;
  const lowStock = typeof stock === "number" && stock > 0 && stock <= 5;
  const badges = productBadges({
    ...product,
    price,
    compare_at_price: compare,
    inventory_quantity: typeof stock === "number" ? stock : product.inventory_quantity,
  }).filter((b) => b.kind !== "sale"); // sale % already next to price

  const cartVariantKey = selected?.id || "";
  const cartQty = useCart((s) => {
    const line = s.items.find(
      (i) => i.product_id === product.id && (i.variant_id || "") === cartVariantKey
    );
    return line?.quantity ?? 0;
  });
  // Optimistic qty so the stepper appears even if persist rehydrate races.
  const [optimisticQty, setOptimisticQty] = useState(0);
  const displayQty = Math.max(cartQty, optimisticQty);
  const inCart = displayQty > 0 && !needsVariant;
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    setOptimisticQty(0);
  }, [variantId, product.id]);

  useEffect(() => {
    if (cartQty > 0) setOptimisticQty(0);
  }, [cartQty]);

  function lineItemFor(variant: Variant | null, quantity: number) {
    const unitPrice = Number(variant?.price ?? product.price) || 0;
    const image = (variant && variantImageList(variant)[0]) || galleryImages[0];
    return {
      product_id: product.id,
      variant_id: variant?.id || undefined,
      vendor_id: product.vendor_id || undefined,
      title: variant ? `${name} — ${variant.title || variant.sku || ""}` : name,
      unit_price: unitPrice,
      quantity,
      slug: product.slug,
      image,
    };
  }

  function openVariantModal(intent: VariantSelectIntent) {
    setModalIntent(intent);
    setModalOpen(true);
  }

  const closeModal = useCallback(() => setModalOpen(false), []);

  function ensureInCart(variant: Variant | null, quantity = 1) {
    const vid = variant?.id;
    const line = useCart.getState().items.find(
      (i) => i.product_id === product.id && (i.variant_id || "") === (vid || "")
    );
    if (line) {
      if (quantity !== line.quantity) setCartQty(product.id, quantity, vid);
      setOptimisticQty(quantity);
      return;
    }
    add(lineItemFor(variant, quantity));
    setOptimisticQty(quantity);
    track("add_to_cart", product.id, {
      slug: product.slug,
      variant_id: variant?.id || "",
      source: "pdp",
    });
  }

  async function onAdd() {
    if (!inStock || inCart || adding) return;
    if (needsVariant) {
      openVariantModal("add");
      return;
    }
    const qty = 1;
    // Flip to stepper immediately — don't wait on storage hydrate.
    setOptimisticQty(qty);
    setAdding(true);
    try {
      await ensureCartHydrated();
      add(lineItemFor(selected, qty));
      track("add_to_cart", product.id, {
        slug: product.slug,
        variant_id: selected?.id || "",
        source: "pdp",
        quantity: qty,
      });
    } finally {
      setAdding(false);
    }
  }

  function onQtyDelta(delta: number) {
    if (!inStock || needsVariant) return;
    const vid = selected?.id;
    const base = Math.max(cartQty, optimisticQty);
    const next = base + delta;
    if (next < 1) {
      setOptimisticQty(0);
      setCartQty(product.id, 0, vid);
      return;
    }
    const capped = Math.min(maxQty, next);
    setOptimisticQty(capped);
    setCartQty(product.id, capped, vid);
  }

  function onBuyNow() {
    if (!inStock) return;
    if (needsVariant) {
      openVariantModal("buy");
      return;
    }
    const qty = inCart ? Math.max(displayQty, 1) : 1;
    void ensureCartHydrated().then(() => {
      ensureInCart(selected, qty);
      router.push(`/${locale}/checkout`);
    });
  }

  function onModalConfirm(id: string) {
    const variant = variants.find((v) => v.id === id) || null;
    if (!variant) return;
    onVariantChange(id);
    setModalOpen(false);
    void ensureCartHydrated().then(() => {
      if (modalIntent === "buy") {
        ensureInCart(variant, 1);
        router.push(`/${locale}/checkout`);
        return;
      }
      setOptimisticQty(1);
      add(lineItemFor(variant, 1));
      track("add_to_cart", product.id, {
        slug: product.slug,
        variant_id: variant.id,
        source: "pdp-modal",
      });
    });
  }

  return (
    <div className="flex h-full min-w-0 w-full max-w-full flex-col lg:rounded-3xl lg:border lg:border-night/8 lg:bg-white/70 lg:p-7 lg:shadow-[0_20px_50px_-28px_rgba(11,31,36,0.35)] lg:backdrop-blur-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {badges.length > 0 ? (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {badges.map((badge) => {
                const label =
                  badge.kind === "sale" && badge.percent != null
                    ? t("badgeSale", { percent: badge.percent })
                    : t(badge.labelKey);
                const style =
                  badge.kind === "new"
                    ? "bg-teal text-paper"
                    : badge.kind === "hit"
                      ? "bg-saffron text-night"
                      : "bg-night/80 text-paper";
                return (
                  <span
                    key={badge.kind}
                    className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide sm:text-[11px] ${style}`}
                  >
                    {label}
                  </span>
                );
              })}
            </div>
          ) : null}
          {(rating != null || reviews != null) && (
            <a
              href="#reviews"
              className="mb-2 inline-flex flex-wrap items-center gap-1.5 text-sm text-muted transition hover:text-teal"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" className="text-saffron" aria-hidden>
                <path
                  fill="currentColor"
                  d="M12 2.5l2.9 6.1 6.6.7-4.9 4.5 1.4 6.5L12 16.9 5.9 20.3l1.4-6.5L2.5 9.3l6.6-.7L12 2.5z"
                />
              </svg>
              {rating != null ? <span className="font-semibold text-night">{rating.toFixed(1)}</span> : null}
              {reviews != null ? (
                <span>
                  ·{" "}
                  {reviews === 1
                    ? t("reviewsCountOne", { count: reviews })
                    : t("reviewsCount", { count: reviews })}
                </span>
              ) : null}
            </a>
          )}
          <h1 className="font-display break-words text-xl font-bold leading-snug text-night sm:text-2xl lg:text-[1.85rem] lg:leading-tight">
            {name}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <ProductShareButton
            title={name}
            className="!h-10 !w-10 !rounded-xl !border !border-night/10 !bg-white !shadow-none hover:!border-teal/35 hover:!text-teal"
          />
          <WishlistButton
            variant="wb"
            className="!h-10 !w-10 !rounded-xl !border !border-night/10 !bg-white !shadow-none"
            product={{
              id: product.id,
              slug: product.slug,
              title: name,
              price,
              image: cover,
            }}
          />
        </div>
      </div>

      {vendorSlug && vendorName ? (
        <Link
          href={`/${locale}/vendors/${vendorSlug}`}
          className="mt-4 flex items-center gap-3 rounded-2xl border border-night/8 bg-white/70 px-3 py-2.5 transition hover:border-teal/35 hover:bg-teal/[0.04]"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-teal/10 text-sm font-bold text-teal">
            {vendorLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={rewriteMediaUrl(vendorLogo)}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              vendorName.slice(0, 1).toUpperCase()
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold text-night">{vendorName}</span>
            <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
              {typeof vendorRating === "number" && vendorRating > 0 ? (
                <>
                  <svg width="11" height="11" viewBox="0 0 24 24" className="text-saffron" aria-hidden>
                    <path
                      fill="currentColor"
                      d="M12 2.5l2.9 6.1 6.6.7-4.9 4.5 1.4 6.5L12 16.9 5.9 20.3l1.4-6.5L2.5 9.3l6.6-.7L12 2.5z"
                    />
                  </svg>
                  <span className="font-semibold text-night/70">{vendorRating.toFixed(1)}</span>
                  <span aria-hidden>·</span>
                </>
              ) : null}
              <span className="font-medium text-teal">{t("vendorStore")}</span>
            </span>
          </span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-night/30" aria-hidden>
            <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      ) : null}

      <div className="mt-5 space-y-5 lg:mt-7 lg:space-y-6">
        <div>
          <div className="flex flex-col gap-1">
            {compare != null ? (
              <p className="text-base text-muted line-through lg:text-lg">
                {formatUZS(compare, locale as Locale)}
              </p>
            ) : null}
            <div className="flex min-w-0 flex-nowrap items-center gap-2.5 overflow-hidden sm:gap-3">
              <p className="shrink-0 text-2xl font-bold tracking-tight text-night sm:text-3xl lg:text-[2.15rem]">
                {formatUZS(price, locale as Locale)}
              </p>
              {discount > 0 ? (
                <span className="shrink-0 rounded-md bg-danger-muted px-2 py-0.5 text-sm font-bold text-danger">
                  −{discount}%
                </span>
              ) : null}
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                inStock ? "bg-teal/10 text-teal" : "bg-night/8 text-muted"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${inStock ? "bg-teal" : "bg-night/30"}`} />
              {inStock ? t("inStock") : t("outOfStock")}
            </span>
            {inStock ? (
              <>
                <span className="text-night/25" aria-hidden>
                  ·
                </span>
                <span className="text-xs font-medium text-night/55">{t("deliverySoon")}</span>
              </>
            ) : null}
            {lowStock && !needsVariant ? (
              <span className="text-xs font-semibold text-danger">
                {t("stockLeft", { count: stock as number })}
              </span>
            ) : null}
            {needsVariant && inStock ? (
              <span className="text-xs font-medium text-muted">{t("selectVariant")}</span>
            ) : null}
          </div>
        </div>

        {variants.length > 0 ? (
          <VariantPicker
            variants={variants}
            variantId={variantId}
            onVariantChange={onVariantChange}
          />
        ) : null}

        {/* Desktop purchase panel */}
        {inStock ? (
          <div className="hidden space-y-4 md:block">
            <div className="grid grid-cols-2 gap-3">
              {inCart ? (
                <div className="flex h-12 items-center justify-center rounded-xl border border-night/12 bg-white">
                  <button
                    type="button"
                    aria-label="−"
                    className="flex h-12 w-12 items-center justify-center text-lg font-medium text-night/70 hover:bg-night/4"
                    onClick={() => onQtyDelta(-1)}
                  >
                    −
                  </button>
                  <span className="min-w-9 flex-1 text-center text-sm font-bold tabular-nums" title={t("quantity")}>
                    {displayQty}
                  </span>
                  <button
                    type="button"
                    aria-label="+"
                    disabled={displayQty >= maxQty}
                    className="flex h-12 w-12 items-center justify-center text-lg font-medium text-night/70 hover:bg-night/4 disabled:opacity-40"
                    onClick={() => onQtyDelta(1)}
                  >
                    +
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => void onAdd()}
                  disabled={adding}
                  className="h-12 rounded-xl bg-accent text-sm font-bold text-night transition hover:bg-accent-hover disabled:opacity-60"
                >
                  {adding ? t("addedToCart") : t("addToCart")}
                </button>
              )}
              <button
                type="button"
                onClick={onBuyNow}
                className="h-12 rounded-xl bg-teal text-sm font-bold text-paper transition hover:bg-teal/90"
              >
                {t("buyNowFull")}
              </button>
            </div>

            {inCart ? (
              <Link
                href={`/${locale}/cart`}
                className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-night/12 bg-white text-sm font-bold text-night transition hover:border-teal/40 hover:text-teal"
              >
                {t("goToCart")}
              </Link>
            ) : null}

            <ul className="space-y-1.5 border-t border-night/6 pt-4 text-xs text-muted">
              <li className="flex gap-2">
                <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal/50" aria-hidden />
                {t("trustPayment")}
              </li>
              <li className="flex gap-2">
                <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal/50" aria-hidden />
                {t("trustReturn")}
              </li>
            </ul>
          </div>
        ) : (
          <p className="hidden rounded-xl bg-night/5 px-4 py-3 text-sm font-semibold text-muted md:block">
            {t("outOfStock")}
          </p>
        )}
      </div>

      <MobileStickyPortal>
        <div className="flex w-full flex-col gap-1.5">
          <p className="truncate text-center text-[11px] font-semibold tabular-nums leading-none text-night/70">
            {formatUZS(price, locale as Locale)}
            {inStock ? (
              <span className="ms-1.5 font-medium text-teal">· {t("deliverySoon")}</span>
            ) : (
              <span className="ms-1.5 font-medium text-muted">· {t("outOfStock")}</span>
            )}
          </p>
          {inStock ? (
            <div className="grid w-full grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onBuyNow}
                className="h-11 w-full rounded-xl bg-teal text-sm font-bold text-paper transition hover:bg-teal/90"
              >
                {t("buyNow")}
              </button>
              {inCart ? (
                <div className="flex h-11 items-center justify-center rounded-xl border border-night/12 bg-white">
                  <button
                    type="button"
                    aria-label="−"
                    className="flex h-11 w-11 items-center justify-center text-lg font-medium text-night/70 hover:bg-night/4"
                    onClick={() => onQtyDelta(-1)}
                  >
                    −
                  </button>
                  <span className="min-w-8 flex-1 text-center text-sm font-bold tabular-nums">{displayQty}</span>
                  <button
                    type="button"
                    aria-label="+"
                    disabled={displayQty >= maxQty}
                    className="flex h-11 w-11 items-center justify-center text-lg font-medium text-night/70 hover:bg-night/4 disabled:opacity-40"
                    onClick={() => onQtyDelta(1)}
                  >
                    +
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => void onAdd()}
                  disabled={adding}
                  className="h-11 w-full rounded-xl bg-accent text-sm font-bold text-night transition hover:bg-accent-hover disabled:opacity-60"
                >
                  {adding ? t("addedToCart") : t("addToCartShort")}
                </button>
              )}
            </div>
          ) : (
            <div className="flex h-11 items-center justify-center rounded-xl bg-night/8 text-sm font-semibold text-muted">
              {t("outOfStock")}
            </div>
          )}
        </div>
      </MobileStickyPortal>

      {variants.length > 0 ? (
        <VariantSelectModal
          open={modalOpen}
          onClose={closeModal}
          product={product}
          variants={variants}
          locale={locale}
          name={name}
          productImages={productImages}
          intent={modalIntent}
          onConfirm={onModalConfirm}
        />
      ) : null}
    </div>
  );
}
