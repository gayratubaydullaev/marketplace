"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import type { Variant } from "@/lib/api";
import { variantImageList } from "@/lib/api";
import {
  buildVariantMatrix,
  colorCover,
  findVariant,
  sizeAvailable,
} from "@/lib/variants";

export function VariantPicker({
  variants,
  variantId,
  onVariantChange,
}: {
  variants: Variant[];
  variantId: string;
  onVariantChange: (id: string) => void;
}) {
  const t = useTranslations("product");
  const matrix = useMemo(() => buildVariantMatrix(variants), [variants]);
  const items = matrix?.items ?? [];
  const colors = matrix?.colors ?? [];
  const sizes = matrix?.sizes ?? [];

  const selectedHit = items.find((i) => i.variant.id === variantId) || null;
  const [color, setColor] = useState<string | null>(selectedHit?.color ?? null);
  const [size, setSize] = useState<string | null>(selectedHit?.size ?? null);

  useEffect(() => {
    const hit = items.find((i) => i.variant.id === variantId);
    if (hit) {
      setColor(hit.color);
      setSize(hit.size);
    } else if (!variantId) {
      setColor(null);
      setSize(null);
    }
  }, [variantId, items]);

  if (!matrix) {
    return (
      <div>
        <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-muted">
          {t("variants")}
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {variants.map((v) => {
            const vStock = v.inventory_quantity;
            const disabled = typeof vStock === "number" && vStock <= 0;
            const thumb = variantImageList(v)[0];
            const active = variantId === v.id;
            return (
              <button
                key={v.id}
                type="button"
                disabled={disabled}
                onClick={() => onVariantChange(v.id)}
                className={`flex min-h-12 w-full items-center gap-3 rounded-xl border px-2.5 py-2 text-start transition disabled:cursor-not-allowed disabled:opacity-40 ${
                  active
                    ? "border-accent bg-accent/10 ring-1 ring-accent/25"
                    : "border-night/12 bg-white hover:border-accent/40"
                }`}
              >
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumb} alt="" className="h-11 w-11 shrink-0 rounded-lg object-cover" />
                ) : (
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-night/5 text-xs font-bold text-night/35">
                    {(v.title || "?").slice(0, 1)}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-night">
                    {v.title || v.sku || "—"}
                  </span>
                  {disabled ? (
                    <span className="text-[11px] font-medium text-muted">{t("outOfStock")}</span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  function resolve(nextColor: string | null, nextSize: string | null) {
    if (!nextColor || !nextSize) return;
    const hit = findVariant(items, nextColor, nextSize);
    if (
      hit &&
      (typeof hit.variant.inventory_quantity !== "number" || hit.variant.inventory_quantity > 0)
    ) {
      onVariantChange(hit.variant.id);
    }
  }

  function pickColor(nextColor: string) {
    setColor(nextColor);
    if (size) {
      const keep = findVariant(items, nextColor, size);
      if (
        keep &&
        (typeof keep.variant.inventory_quantity !== "number" || keep.variant.inventory_quantity > 0)
      ) {
        onVariantChange(keep.variant.id);
        return;
      }
      setSize(null);
      return;
    }
    resolve(nextColor, size);
  }

  function pickSize(nextSize: string) {
    setSize(nextSize);
    resolve(color, nextSize);
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-2.5 flex items-baseline justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("color")}</p>
          <p className="truncate text-xs font-semibold text-night">{color || t("chooseColor")}</p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          {colors.map((c) => {
            const cover = colorCover(items, c);
            const anyInStock = items.some(
              (i) =>
                i.color === c &&
                (typeof i.variant.inventory_quantity !== "number" || i.variant.inventory_quantity > 0)
            );
            const active = color === c;
            return (
              <button
                key={c}
                type="button"
                disabled={!anyInStock}
                onClick={() => pickColor(c)}
                title={c}
                className={`group relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl border-2 transition disabled:cursor-not-allowed disabled:opacity-35 sm:h-16 sm:w-16 ${
                  active
                    ? "border-accent ring-2 ring-accent/20"
                    : "border-night/10 hover:border-accent/50"
                }`}
                aria-pressed={active}
                aria-label={c}
              >
                {cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cover} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-xs font-bold text-night">{c.slice(0, 2)}</span>
                )}
                {!anyInStock ? (
                  <span className="absolute inset-0 bg-paper/50" aria-hidden />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-2.5 flex items-baseline justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("size")}</p>
          <p className="truncate text-xs font-semibold text-night">{size || t("chooseSize")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {sizes.map((s) => {
            const ok = color
              ? sizeAvailable(items, color, s)
              : items.some(
                  (i) =>
                    i.size === s &&
                    (typeof i.variant.inventory_quantity !== "number" ||
                      i.variant.inventory_quantity > 0)
                );
            const exists = color
              ? Boolean(findVariant(items, color, s))
              : items.some((i) => i.size === s);
            const active = size === s;
            return (
              <button
                key={s}
                type="button"
                disabled={!exists || !ok}
                onClick={() => pickSize(s)}
                className={`min-h-11 min-w-[3rem] rounded-xl border px-3.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-35 sm:min-h-12 sm:min-w-[3.25rem] ${
                  active
                    ? "border-accent bg-accent text-night"
                    : "border-night/12 bg-white text-night hover:border-accent/50"
                }`}
                aria-pressed={active}
              >
                {s}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
