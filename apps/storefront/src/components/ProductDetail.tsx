"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { Product, Variant } from "@/lib/api";
import { resolveGalleryImages, variantImageList } from "@/lib/api";
import { rewriteMediaUrl, rewriteMediaUrls } from "@/lib/media";
import { ProductGallery } from "@/components/ProductGallery";
import { ProductPurchase } from "@/components/ProductPurchase";

export function ProductDetail({
  product,
  variants,
  locale,
  name,
  vendorSlug,
  vendorName,
  vendorLogo,
  vendorRating,
  info,
}: {
  product: Product;
  variants: Variant[];
  locale: string;
  name: string;
  vendorSlug?: string;
  vendorName?: string;
  vendorLogo?: string;
  vendorRating?: number;
  info?: ReactNode;
}) {
  const productImages = useMemo(() => {
    const raw = Array.isArray(product.images)
      ? product.images.filter((image): image is string => typeof image === "string")
      : [];
    // Keep every gallery slot (do not unique) so left thumbs render when API sends repeated URLs.
    const base = rewriteMediaUrls(raw, {
      fallbackKey: product.id || product.slug,
      unique: false,
    });
    const out = base.length > 0 ? [...base] : [];
    for (const variant of variants) {
      for (const url of variantImageList(variant)) {
        if (url && !out.includes(url)) out.push(url);
      }
    }
    if (out.length === 0) {
      out.push(rewriteMediaUrl("", { fallbackKey: product.id || product.slug }));
    }
    return out;
  }, [product.images, product.id, product.slug, variants]);

  const [variantId, setVariantId] = useState(() => {
    if (variants.length === 0) return "";
    const inStock = variants.find(
      (v) => typeof v.inventory_quantity !== "number" || (v.inventory_quantity ?? 0) > 0
    );
    return (inStock || variants[0]).id;
  });
  const selected = useMemo(
    () => variants.find((v) => v.id === variantId) || null,
    [variants, variantId]
  );

  const { images, focusIndex } = useMemo(
    () => resolveGalleryImages(productImages, selected),
    [productImages, selected]
  );

  return (
    <div className="flex w-full min-w-0 max-w-full flex-col gap-6 sm:gap-8 lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)] lg:items-start lg:gap-x-10 lg:gap-y-12 xl:grid-cols-[minmax(0,1.25fr)_minmax(22rem,0.75fr)] xl:gap-x-14 2xl:gap-x-16">
      <div className="min-w-0 max-w-full">
        <ProductGallery images={images} focusIndex={focusIndex} name={name} />
      </div>

      <div className="min-w-0 max-w-full lg:sticky lg:top-header-offset lg:row-span-2 lg:self-start">
        <ProductPurchase
          product={product}
          variants={variants}
          locale={locale}
          name={name}
          vendorSlug={vendorSlug}
          vendorName={vendorName}
          vendorLogo={vendorLogo}
          vendorRating={vendorRating}
          variantId={variantId}
          onVariantChange={setVariantId}
          galleryImages={images}
          productImages={productImages}
        />
      </div>

      {info ? <div className="min-w-0 max-w-full md:col-start-1">{info}</div> : null}
    </div>
  );
}
