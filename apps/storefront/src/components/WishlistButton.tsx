"use client";

import { useTranslations } from "next-intl";
import { useWishlist } from "@/lib/wishlist";

type Item = { id: string; slug: string; title: string; price: number; image?: string };

export function WishlistButton({
  product,
  className = "",
  variant = "default",
}: {
  product: Item;
  className?: string;
  variant?: "default" | "wb";
}) {
  const t = useTranslations("nav");
  const has = useWishlist((s) => s.has(product.id));
  const toggle = useWishlist((s) => s.toggle);

  if (variant === "wb") {
    return (
      <button
        type="button"
        aria-label={t("wishlist")}
        aria-pressed={has}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          toggle(product);
        }}
        className={`flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-[#1a1a1a] shadow-[0_2px_8px_rgba(0,0,0,0.12)] backdrop-blur-sm transition hover:scale-105 ${
          has ? "text-danger" : "hover:text-teal"
        } ${className}`}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill={has ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.7"
          aria-hidden
        >
          <path
            d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 11c0 5.5-7 10-7 10z"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-label={t("wishlist")}
      aria-pressed={has}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(product);
      }}
      className={`flex h-9 w-9 items-center justify-center rounded-full border bg-paper/95 shadow-sm backdrop-blur-sm transition ${
        has
          ? "border-saffron/50 text-saffron"
          : "border-night/10 text-night/45 hover:border-teal/40 hover:text-teal"
      } ${className}`}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill={has ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.8"
        aria-hidden
      >
        <path
          d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 11c0 5.5-7 10-7 10z"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
