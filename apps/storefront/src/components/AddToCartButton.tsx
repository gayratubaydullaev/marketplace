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
      className={`rounded-full bg-teal px-6 py-3 text-sm font-bold text-paper transition hover:bg-night disabled:opacity-50 sm:px-8 ${className}`}
    >
      {label}
    </button>
  );
}
