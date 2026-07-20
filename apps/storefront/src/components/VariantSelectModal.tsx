"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { formatUZS, type Locale } from "@gayrat/i18n";
import type { Product, Variant } from "@/lib/api";
import { resolveGalleryImages, variantImageList } from "@/lib/api";
import { VariantPicker } from "@/components/VariantPicker";

export type VariantSelectIntent = "add" | "buy";

export function VariantSelectModal({
  open,
  onClose,
  product,
  variants,
  locale,
  name,
  productImages,
  intent,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  product: Product;
  variants: Variant[];
  locale: string;
  name: string;
  productImages: string[];
  intent: VariantSelectIntent;
  onConfirm: (variantId: string) => void;
}) {
  const t = useTranslations("product");
  const [draftId, setDraftId] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setDraftId("");
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const selected = useMemo(
    () => variants.find((v) => v.id === draftId) || null,
    [variants, draftId]
  );

  const preview = useMemo(() => {
    if (selected) {
      const imgs = variantImageList(selected);
      if (imgs[0]) return imgs[0];
    }
    return resolveGalleryImages(productImages, null).images[0] || "";
  }, [selected, productImages]);

  const price = selected?.price ?? product.price;
  const stock = selected?.inventory_quantity ?? product.inventory_quantity;
  const inStock = typeof stock !== "number" || stock > 0;
  const canConfirm = Boolean(draftId) && inStock;

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-labelledby="variant-select-title">
      <button
        type="button"
        className="absolute inset-0 bg-night/50"
        aria-label={t("closeVariantModal")}
        onClick={onClose}
      />
      <div
        className="absolute inset-x-0 bottom-[var(--bottom-nav-h,0px)] flex max-h-[min(92dvh,calc(100dvh-var(--bottom-nav-h,0px)))] animate-rise flex-col rounded-t-3xl bg-paper shadow-2xl sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:max-h-[min(88dvh,720px)] sm:w-[min(100%-2rem,420px)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-3xl"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <div className="shrink-0 px-5 pt-3 sm:pt-5">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-night/15 sm:hidden" />
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="variant-select-title" className="font-display text-lg font-bold text-night">
                {t("selectVariant")}
              </h2>
              <p className="mt-0.5 truncate text-sm text-muted">{name}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-night/5 hover:text-night"
              aria-label={t("closeVariantModal")}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pb-2">
          <div className="flex gap-3">
            <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-night/5 sm:h-28 sm:w-28">
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="" className="h-full w-full object-cover" />
              ) : null}
            </div>
            <div className="min-w-0 flex-1 self-center">
              <p className="text-xl font-bold tabular-nums text-night">
                {formatUZS(price, locale as Locale)}
              </p>
              {selected?.title ? (
                <p className="mt-1 truncate text-sm font-medium text-night/70">{selected.title}</p>
              ) : (
                <p className="mt-1 text-sm text-muted">{t("selectVariantHint")}</p>
              )}
            </div>
          </div>

          <VariantPicker variants={variants} variantId={draftId} onVariantChange={setDraftId} />
        </div>

        <div className="shrink-0 border-t border-night/8 px-5 py-3">
          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => {
              if (!canConfirm) return;
              onConfirm(draftId);
            }}
            className="h-12 w-full rounded-xl bg-accent text-sm font-bold text-night transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {intent === "buy" ? t("buyNowFull") : t("addToCart")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
