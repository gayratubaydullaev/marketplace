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

function mergeLine(items: CartLine[], item: CartLine): CartLine[] {
  const key = lineKey(item);
  const existing = items.find((i) => lineKey(i) === key);
  if (existing) {
    return items.map((i) => (lineKey(i) === key ? { ...i, quantity: i.quantity + item.quantity } : i));
  }
  return [...items, item];
}

/** Union storage + in-memory lines so a late rehydrate cannot wipe a just-added item. */
function mergeCartItems(fromStorage: CartLine[], fromMemory: CartLine[]): CartLine[] {
  const map = new Map<string, CartLine>();
  for (const i of fromStorage) map.set(lineKey(i), i);
  for (const i of fromMemory) {
    const k = lineKey(i);
    const prev = map.get(k);
    if (!prev) {
      map.set(k, i);
      continue;
    }
    map.set(k, {
      ...prev,
      ...i,
      title: i.title || prev.title,
      slug: i.slug || prev.slug,
      image: i.image || prev.image,
      unit_price: i.unit_price || prev.unit_price,
      quantity: Math.max(prev.quantity, i.quantity),
    });
  }
  return [...map.values()];
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
      add: (item) => set((s) => ({ items: mergeLine(s.items, item) })),
      setQty: (productId, qty, variantId) =>
        set((s) => ({
          items:
            qty < 1
              ? s.items.filter(
                  (i) => !(i.product_id === productId && (i.variant_id || "") === (variantId || ""))
                )
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
        await ensureCartHydrated();
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
    {
      name: "gayrat-cart",
      // Avoid SSR/client race: empty store overwriting a tap made before rehydrate finishes.
      skipHydration: true,
      merge: (persistedState, currentState) => {
        const persisted = (persistedState ?? {}) as Partial<CartState>;
        const current = currentState as CartState;
        const fromStorage = Array.isArray(persisted.items) ? persisted.items : [];
        return {
          ...current,
          ...persisted,
          items: mergeCartItems(fromStorage, current.items),
        };
      },
    }
  )
);

let hydratePromise: Promise<void> | null = null;

/** Wait until localStorage cart is loaded (Next.js client). Safe to call often. */
export function ensureCartHydrated(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (useCart.persist.hasHydrated()) return Promise.resolve();
  if (!hydratePromise) {
    hydratePromise = new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      if (useCart.persist.hasHydrated()) {
        finish();
        return;
      }
      const unsub = useCart.persist.onFinishHydration(() => {
        unsub();
        finish();
      });
      void Promise.resolve(useCart.persist.rehydrate()).then(() => {
        if (useCart.persist.hasHydrated()) {
          unsub();
          finish();
        }
      });
    }).finally(() => {
      hydratePromise = null;
    });
  }
  return hydratePromise;
}
