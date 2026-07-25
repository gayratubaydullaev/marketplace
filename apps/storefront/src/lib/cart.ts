import { create } from "zustand";
import { persist } from "zustand/middleware";
import { api } from "@/lib/api";

export type CartLine = {
  product_id: string;
  variant_id?: string;
  vendor_id?: string;
  vendor_name?: string;
  title: string;
  unit_price: number;
  quantity: number;
  slug: string;
  image?: string;
};

function lineKey(item: { product_id: string; variant_id?: string }) {
  return `${item.product_id}:${item.variant_id || ""}`;
}

function fingerprint(items: CartLine[]) {
  return JSON.stringify(
    items.map((i) => ({
      k: lineKey(i),
      q: i.quantity,
      p: i.unit_price,
    }))
  );
}

type CartState = {
  items: CartLine[];
  add: (item: CartLine) => void;
  setQty: (productId: string, qty: number, variantId?: string) => void;
  remove: (productId: string, variantId?: string) => void;
  clear: () => void;
  total: () => number;
  syncToServer: (force?: boolean) => Promise<void>;
};

export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      add: (item) =>
        set((s) => {
          const key = lineKey(item);
          const existing = s.items.find((i) => lineKey(i) === key);
          if (existing) {
            return {
              items: s.items.map((i) =>
                lineKey(i) === key ? { ...i, quantity: i.quantity + item.quantity } : i
              ),
            };
          }
          return { items: [...s.items, item] };
        }),
      setQty: (productId, qty, variantId) =>
        set((s) => ({
          items:
            qty < 1
              ? s.items.filter((i) => !(i.product_id === productId && (i.variant_id || "") === (variantId || "")))
              : s.items.map((i) =>
                  i.product_id === productId && (i.variant_id || "") === (variantId || "")
                    ? { ...i, quantity: qty }
                    : i
                ),
        })),
      remove: (productId, variantId) =>
        set((s) => ({
          items: s.items.filter(
            (i) => !(i.product_id === productId && (i.variant_id || "") === (variantId || ""))
          ),
        })),
      clear: () => {
        if (typeof window !== "undefined") sessionStorage.removeItem("cart_sync_fp");
        set({ items: [] });
      },
      total: () => get().items.reduce((a, i) => a + i.unit_price * i.quantity, 0),
      syncToServer: async (force = false) => {
        const items = get().items;
        if (typeof window === "undefined") return;
        const fp = fingerprint(items);
        if (!force && sessionStorage.getItem("cart_sync_fp") === fp) return;

        await api<{ cart: { id: string }; items?: unknown[]; synced?: number }>("/v1/cart/sync", {
          method: "POST",
          body: JSON.stringify({
            items: items.map((item) => ({
              product_id: item.product_id,
              variant_id: item.variant_id || undefined,
              quantity: item.quantity,
            })),
          }),
        });
        sessionStorage.setItem("cart_sync_fp", fp);
      },
    }),
    { name: "gayrat-cart" }
  )
);
