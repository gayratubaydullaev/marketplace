"use client";

import Link from "next/link";
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatUZS, type Locale } from "@gayrat/i18n";
import { useWishlist } from "@/lib/wishlist";
import { useCart } from "@/lib/cart";
import { EmptyState, PageHeader } from "@/components/PageChrome";

export default function WishlistPage() {
  const locale = useLocale();
  const t = useTranslations("wishlist");
  const tp = useTranslations("product");
  const { items, remove } = useWishlist();
  const add = useCart((s) => s.add);
  const [addedId, setAddedId] = useState<string | null>(null);

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
                    <img src={item.image} alt="" className="h-full w-full object-cover" />
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
              className={`mt-2 w-full rounded-xl py-2 text-sm font-bold transition ${
                addedId === item.id ? "bg-teal text-paper" : "bg-accent text-night hover:bg-accent-hover"
              }`}
              onClick={() => {
                add({
                  product_id: item.id,
                  title: item.title,
                  unit_price: item.price,
                  quantity: 1,
                  slug: item.slug,
                  image: item.image,
                });
                setAddedId(item.id);
                window.setTimeout(() => setAddedId(null), 1400);
              }}
            >
              {addedId === item.id ? tp("addedToCart") : t("addToCart")}
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}
