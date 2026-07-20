"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { formatUZS, type Locale } from "@gayrat/i18n";
import type { Product, Variant } from "@/lib/api";
import { variantImageList } from "@/lib/api";
import { useCart } from "@/lib/cart";
import { WishlistButton } from "@/components/WishlistButton";
import { MobileStickyPortal } from "@/components/MobileStickyPortal";
import { VariantPicker } from "@/components/VariantPicker";
import {
  VariantSelectModal,
  type VariantSelectIntent,
} from "@/components/VariantSelectModal";

export function ProductPurchase({
  product,
  variants,
  locale,
  name,
  vendorSlug,
  vendorName,
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

  const selected = useMemo(
    () => variants.find((v) => v.id === variantId) || null,
    [variants, variantId]
  );
  const needsVariant = variants.length > 0 && !variantId;
  const price = selected?.price ?? product.price;
  const stock = selected?.inventory_quantity ?? product.inventory_quantity;
  const inStock = typeof stock !== "number" || stock > 0;
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

  const cartQty = useCart((s) => {
    const line = s.items.find(
      (i) => i.product_id === product.id && (i.variant_id || "") === (selected?.id || "")
    );
    return line?.quantity ?? 0;
  });
  const inCart = cartQty > 0 && Boolean(selected);

  function lineItemFor(variant: Variant | null, quantity: number) {
    const unitPrice = variant?.price ?? product.price;
    const image = (variant && variantImageList(variant)[0]) || galleryImages[0];
    return {
      product_id: product.id,
      variant_id: variant?.id,
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
      return;
    }
    add(lineItemFor(variant, quantity));
  }

  function onAdd() {
    if (!inStock || inCart) return;
    if (needsVariant) {
      openVariantModal("add");
      return;
    }
    add(lineItemFor(selected, 1));
  }

  function onQtyDelta(delta: number) {
    if (!inStock || !selected) return;
    const next = cartQty + delta;
    if (next < 1) {
      setCartQty(product.id, 0, selected.id);
      return;
    }
    setCartQty(product.id, Math.min(maxQty, next), selected.id);
  }

  function onBuyNow() {
    if (!inStock) return;
    if (needsVariant) {
      openVariantModal("buy");
      return;
    }
    ensureInCart(selected, Math.max(cartQty, 1));
    router.push(`/${locale}/checkout`);
  }

  function onModalConfirm(id: string) {
    const variant = variants.find((v) => v.id === id) || null;
    if (!variant) return;
    onVariantChange(id);
    setModalOpen(false);
    if (modalIntent === "buy") {
      ensureInCart(variant, 1);
      router.push(`/${locale}/checkout`);
      return;
    }
    add(lineItemFor(variant, 1));
  }

  return (
    <div className="flex h-full min-w-0 max-w-full flex-col lg:rounded-3xl lg:border lg:border-night/8 lg:bg-white/70 lg:p-7 lg:shadow-[0_20px_50px_-28px_rgba(11,31,36,0.35)] lg:backdrop-blur-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {(rating != null || reviews != null) && (
            <div className="mb-2 flex flex-wrap items-center gap-1.5 text-sm text-muted">
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
            </div>
          )}
          <h1 className="font-display break-words text-xl font-bold leading-snug text-night sm:text-2xl lg:text-[1.85rem] lg:leading-tight">
            {name}
          </h1>
          {vendorSlug && vendorName ? (
            <Link
              href={`/${locale}/vendors/${vendorSlug}`}
              className="mt-2 inline-block text-sm font-semibold text-teal hover:underline"
            >
              {t("vendor")}: {vendorName}
            </Link>
          ) : null}
        </div>
        <WishlistButton
          variant="wb"
          product={{
            id: product.id,
            slug: product.slug,
            title: name,
            price,
            image: cover,
          }}
        />
      </div>

      <div className="mt-5 space-y-5 lg:mt-7 lg:space-y-6">
        <div>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="text-2xl font-bold tracking-tight text-night sm:text-3xl lg:text-[2.15rem]">
              {formatUZS(price, locale as Locale)}
            </p>
            {compare != null ? (
              <p className="text-base text-muted line-through lg:text-lg">
                {formatUZS(compare, locale as Locale)}
              </p>
            ) : null}
            {discount > 0 ? (
              <span className="rounded-md bg-danger-muted px-2 py-0.5 text-sm font-bold text-danger">
                −{discount}%
              </span>
            ) : null}
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
                <span className="text-xs font-medium text-teal">{t("deliverySoon")}</span>
              </>
            ) : null}
            {lowStock && selected ? (
              <span className="text-xs font-semibold text-danger">
                {t("stockLeft", { count: stock as number })}
              </span>
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
                  <span className="min-w-9 flex-1 text-center text-sm font-bold tabular-nums">{cartQty}</span>
                  <button
                    type="button"
                    aria-label="+"
                    disabled={cartQty >= maxQty}
                    className="flex h-12 w-12 items-center justify-center text-lg font-medium text-night/70 hover:bg-night/4 disabled:opacity-40"
                    onClick={() => onQtyDelta(1)}
                  >
                    +
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={onAdd}
                  className="h-12 rounded-xl bg-accent text-sm font-bold text-night transition hover:bg-accent-hover"
                >
                  {t("addToCart")}
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

            <ul className="space-y-2 border-t border-night/8 pt-4 text-sm text-night/65">
              <li className="flex items-start gap-2.5">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal" />
                {t("trustDelivery")}
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal" />
                {t("trustReturn")}
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal" />
                {t("trustPayment")}
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
                  <span className="min-w-8 flex-1 text-center text-sm font-bold tabular-nums">{cartQty}</span>
                  <button
                    type="button"
                    aria-label="+"
                    disabled={cartQty >= maxQty}
                    className="flex h-11 w-11 items-center justify-center text-lg font-medium text-night/70 hover:bg-night/4 disabled:opacity-40"
                    onClick={() => onQtyDelta(1)}
                  >
                    +
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={onAdd}
                  className="h-11 w-full rounded-xl bg-accent text-sm font-bold text-night transition hover:bg-accent-hover"
                >
                  {t("addToCartShort")}
                </button>
              )}
              <button
                type="button"
                onClick={onBuyNow}
                className="h-11 w-full rounded-xl bg-teal text-sm font-bold text-paper transition hover:bg-teal/90"
              >
                {t("buyNow")}
              </button>
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
