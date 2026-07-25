"use client";

import Link from "next/link";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatUZS, type Locale } from "@gayrat/i18n";
import { api, variantImageList, type Product, type Variant } from "@/lib/api";
import { useWishlist } from "@/lib/wishlist";
import { useCart, ensureCartHydrated } from "@/lib/cart";
import { rewriteMediaUrl } from "@/lib/media";
import { EmptyState, PageHeader } from "@/components/PageChrome";
import { VariantSelectModal } from "@/components/VariantSelectModal";

export default function WishlistPage() {
  const locale = useLocale();
  const t = useTranslations("wishlist");
  const tp = useTranslations("product");
  const { items, remove } = useWishlist();
  const add = useCart((s) => s.add);
  const [addedId, setAddedId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalProduct, setModalProduct] = useState<Product | null>(null);
  const [modalVariants, setModalVariants] = useState<Variant[]>([]);
  const [modalName, setModalName] = useState("");
  const [modalImages, setModalImages] = useState<string[]>([]);

  function flashAdded(id: string) {
    setAddedId(id);
    window.setTimeout(() => setAddedId(null), 1400);
  }

  async function onAdd(item: (typeof items)[number]) {
    if (loadingId) return;
    setLoadingId(item.id);
    try {
      await ensureCartHydrated();
      let list: Variant[] = [];
      let product: Product | undefined;
      try {
        const data = await api<{ product?: Product; variants?: Variant[] | null }>(
          `/v1/products/${item.slug}`
        );
        list = Array.isArray(data.variants) ? data.variants : [];
        product = data.product;
      } catch {
        add({
          product_id: item.id,
          title: item.title,
          unit_price: item.price,
          quantity: 1,
          slug: item.slug,
          image: item.image,
        });
        flashAdded(item.id);
        return;
      }
      if (list.length > 0) {
        const p: Product = product || {
          id: item.id,
          slug: item.slug,
          translations: {},
          price: item.price,
          currency: "UZS",
          images: item.image ? [item.image] : [],
        };
        setModalProduct(p);
        setModalVariants(list);
        setModalName(item.title);
        setModalImages(
          Array.isArray(p.images)
            ? p.images.filter((x): x is string => typeof x === "string")
            : item.image
              ? [item.image]
              : []
        );
        setModalOpen(true);
        return;
      }
      add({
        product_id: item.id,
        title: item.title,
        unit_price: item.price,
        quantity: 1,
        slug: item.slug,
        image: item.image,
      });
      flashAdded(item.id);
    } finally {
      setLoadingId(null);
    }
  }

  function onModalConfirm(variantId: string) {
    if (!modalProduct) return;
    const variant = modalVariants.find((v) => v.id === variantId);
    if (!variant) return;
    setModalOpen(false);
    add({
      product_id: modalProduct.id,
      variant_id: variant.id,
      vendor_id: modalProduct.vendor_id || undefined,
      title: `${modalName} — ${variant.title || variant.sku || ""}`,
      unit_price: variant.price ?? modalProduct.price,
      quantity: 1,
      slug: modalProduct.slug,
      image: variantImageList(variant)[0] || modalImages[0],
    });
    flashAdded(modalProduct.id);
  }

  if (items.length === 0) {
    return (
      <div className="animate-rise py-6">
        <PageHeader title={t("title")} />
        <div className="mt-8">
          <EmptyState title={t("empty")} actionHref={`/${locale}/products`} actionLabel={t("browse")} />
        </div>
      </div>
    );
  }

  return (
    <div className="animate-rise">
      <PageHeader title={t("title")} subtitle={`${items.length}`} />
      <div className="mt-8 grid grid-cols-2 gap-x-2.5 gap-y-6 sm:gap-x-4 sm:gap-y-8 lg:grid-cols-4 xl:grid-cols-5">
        {items.map((item) => (
          <article key={item.id} className="group flex flex-col">
            <div className="relative overflow-hidden rounded-2xl bg-[#f2f2f5]">
              <Link href={`/${locale}/products/${item.slug}`} className="block">
                <div className="aspect-[3/4]">
                  {item.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={rewriteMediaUrl(item.image, { fallbackKey: item.id })}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-end p-4 text-3xl font-bold text-night/15">
                      {item.title.slice(0, 1)}
                    </div>
                  )}
                </div>
              </Link>
              <button
                type="button"
                onClick={() => remove(item.id)}
                className="absolute end-2 top-2 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-danger shadow-sm"
                aria-label={t("remove")}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 11c0 5.5-7 10-7 10z" />
                </svg>
              </button>
            </div>
            <Link href={`/${locale}/products/${item.slug}`} className="mt-2.5 block px-0.5">
              <p className="text-[15px] font-bold text-night">{formatUZS(item.price, locale as Locale)}</p>
              <h3 className="mt-1 line-clamp-2 text-[13px] leading-snug text-night/80">{item.title}</h3>
            </Link>
            <button
              type="button"
              disabled={loadingId === item.id}
              className={`mt-2 w-full rounded-xl py-2 text-sm font-bold transition disabled:opacity-60 ${
                addedId === item.id ? "bg-teal text-paper" : "bg-accent text-night hover:bg-accent-hover"
              }`}
              onClick={() => onAdd(item)}
            >
              {addedId === item.id ? tp("addedToCart") : loadingId === item.id ? "…" : t("addToCart")}
            </button>
          </article>
        ))}
      </div>

      {modalProduct ? (
        <VariantSelectModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          product={modalProduct}
          variants={modalVariants}
          locale={locale}
          name={modalName}
          productImages={modalImages}
          intent="add"
          onConfirm={onModalConfirm}
        />
      ) : null}
    </div>
  );
}
