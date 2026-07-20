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
  syncToServer: () => Promise<void>;
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
      syncToServer: async () => {
        const items = get().items;
        if (typeof window === "undefined") return;
        const fp = fingerprint(items);
        if (sessionStorage.getItem("cart_sync_fp") === fp) return;

        if (localStorage.getItem("access_token")) {
          await api("/v1/cart/merge", {
            method: "POST",
            body: JSON.stringify({ items }),
          }).catch(() => undefined);
        } else {
          for (const item of items) {
            await api("/v1/cart/items", {
              method: "POST",
              body: JSON.stringify({
                product_id: item.product_id,
                variant_id: item.variant_id,
                quantity: item.quantity,
              }),
            }).catch(() => undefined);
          }
        }
        sessionStorage.setItem("cart_sync_fp", fp);
      },
    }),
    { name: "gayrat-cart" }
  )
);
