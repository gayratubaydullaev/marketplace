"use client";

import { useCart, type CartLine } from "@/lib/cart";

export function AddToCartButton({
  product,
  label,
  disabled,
  className = "",
}: {
  product: CartLine;
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  const add = useCart((s) => s.add);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => add(product)}
      className={`inline-flex min-h-11 items-center justify-center rounded-xl bg-accent px-6 py-3 text-sm font-bold text-night transition hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal disabled:opacity-50 sm:px-8 ${className}`}
    >
      {label}
    </button>
  );
}
