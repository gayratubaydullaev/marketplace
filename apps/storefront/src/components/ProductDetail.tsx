"use client";

import { useMemo, useState } from "react";
import type { Product, Variant } from "@/lib/api";
import { resolveGalleryImages } from "@/lib/api";
import { ProductGallery } from "@/components/ProductGallery";
import { ProductPurchase } from "@/components/ProductPurchase";

export function ProductDetail({
  product,
  variants,
  locale,
  name,
  vendorSlug,
  vendorName,
}: {
  product: Product;
  variants: Variant[];
  locale: string;
  name: string;
  vendorSlug?: string;
  vendorName?: string;
}) {
  const productImages = useMemo(
    () =>
      Array.isArray(product.images)
        ? product.images.filter((image): image is string => typeof image === "string")
        : [],
    [product.images]
  );

  const [variantId, setVariantId] = useState("");
  const selected = useMemo(
    () => variants.find((v) => v.id === variantId) || null,
    [variants, variantId]
  );

  const { images, focusIndex } = useMemo(
    () => resolveGalleryImages(productImages, selected),
    [productImages, selected]
  );

  return (
    <div className="grid w-full min-w-0 max-w-full gap-8 md:gap-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)] lg:items-start lg:gap-12 xl:gap-16">
      <div className="min-w-0 max-w-full">
        <ProductGallery images={images} focusIndex={focusIndex} name={name} />
      </div>
      <div className="min-w-0 max-w-full lg:sticky lg:top-28 lg:self-start">
        <ProductPurchase
          product={product}
          variants={variants}
          locale={locale}
          name={name}
          vendorSlug={vendorSlug}
          vendorName={vendorName}
          variantId={variantId}
          onVariantChange={setVariantId}
          galleryImages={images}
          productImages={productImages}
        />
      </div>
    </div>
  );
}
