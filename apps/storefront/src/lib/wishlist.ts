import { create } from "zustand";
import { persist } from "zustand/middleware";
import { api } from "@/lib/api";

export type WishlistItem = {
  /** Product ID; retained as `id` for existing storefront consumers. */
  id: string;
  slug: string;
  title: string;
  price: number;
  image?: string;
  variant_id?: string;
  remote_id?: string;
};

type State = {
  items: WishlistItem[];
  has: (id: string) => boolean;
  toggle: (item: WishlistItem) => void;
  remove: (id: string) => void;
  clear: () => void;
  syncToServer: () => Promise<void>;
};

export const useWishlist = create<State>()(
  persist(
    (set, get) => ({
      items: [],
      has: (id) => get().items.some((i) => i.id === id),
      toggle: (item) => {
        const existing = get().items.find((i) => i.id === item.id && i.variant_id === item.variant_id);
        if (existing) {
          set((s) => ({ items: s.items.filter((i) => i !== existing) }));
          if (typeof window !== "undefined" && localStorage.getItem("access_token") && existing.remote_id) {
            api(`/v1/wishlist/items/${existing.remote_id}`, { method: "DELETE" }).catch(() => undefined);
          }
          return;
        }
        set((s) => ({ items: [...s.items, item] }));
        if (typeof window !== "undefined" && localStorage.getItem("access_token")) {
          api<{ item: { id: string } }>("/v1/wishlist/items", {
            method: "POST",
            body: JSON.stringify({ product_id: item.id, variant_id: item.variant_id }),
          })
            .then(({ item: remote }) =>
              set((s) => ({
                items: s.items.map((i) => (i === item ? { ...i, remote_id: remote.id } : i)),
              }))
            )
            .catch(() => undefined);
        }
      },
      remove: (id) => {
        const existing = get().items.find((item) => item.id === id);
        set((s) => ({ items: s.items.filter((item) => item.id !== id) }));
        if (typeof window !== "undefined" && localStorage.getItem("access_token") && existing?.remote_id) {
          api(`/v1/wishlist/items/${existing.remote_id}`, { method: "DELETE" }).catch(() => undefined);
        }
      },
      clear: () => set({ items: [] }),
      syncToServer: async () => {
        if (typeof window === "undefined" || !localStorage.getItem("access_token")) return;
        const localItems = get().items;
        await api("/v1/wishlist/merge", {
          method: "POST",
          body: JSON.stringify({
            items: localItems.map((item) => ({ product_id: item.id, variant_id: item.variant_id })),
          }),
        });
        const result = await api<{ items: Array<{ id: string; product_id: string; variant_id?: string }> }>("/v1/wishlist");
        set((s) => ({
          items: s.items.map((item) => {
            const remote = result.items.find(
              (candidate) =>
                candidate.product_id === item.id && (candidate.variant_id || "") === (item.variant_id || "")
            );
            return remote ? { ...item, remote_id: remote.id } : item;
          }),
        }));
      },
    }),
    { name: "gayrat-wishlist" }
  )
);
