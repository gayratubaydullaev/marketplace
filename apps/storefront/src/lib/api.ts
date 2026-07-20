export const TENANT_ID =
  process.env.NEXT_PUBLIC_TENANT_ID || "00000000-0000-0000-0000-000000000001";

/** Single gateway entry (Kong / Next rewrites). No per-service ports. */
const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8080").replace(/\/$/, "");

function resolve(path: string) {
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const refresh = localStorage.getItem("refresh_token");
  if (!refresh) return false;
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch(resolve("/v1/auth/refresh"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Tenant-ID": TENANT_ID,
          },
          body: JSON.stringify({ refresh_token: refresh }),
          cache: "no-store",
        });
        if (!res.ok) {
          localStorage.removeItem("access_token");
          localStorage.removeItem("refresh_token");
          return false;
        }
        const data = (await res.json()) as {
          tokens?: { access_token?: string; refresh_token?: string };
          access_token?: string;
        };
        const access = data.tokens?.access_token || data.access_token;
        if (!access) return false;
        localStorage.setItem("access_token", access);
        if (data.tokens?.refresh_token) {
          localStorage.setItem("refresh_token", data.tokens.refresh_token);
        }
        return true;
      } catch {
        return false;
      } finally {
        refreshPromise = null;
      }
    })();
  }
  return refreshPromise;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("X-Tenant-ID", TENANT_ID);
  if (!(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("access_token");
    if (token) headers.set("Authorization", `Bearer ${token}`);
    let guest = localStorage.getItem("guest_id");
    if (!guest) {
      guest = crypto.randomUUID();
      localStorage.setItem("guest_id", guest);
    }
    headers.set("X-Guest-ID", guest);
  }

  let res = await fetch(resolve(path), { ...init, headers, cache: "no-store" });
  if (res.status === 401 && typeof window !== "undefined" && !path.includes("/auth/")) {
    const ok = await tryRefresh();
    if (ok) {
      const retryHeaders = new Headers(init.headers);
      retryHeaders.set("X-Tenant-ID", TENANT_ID);
      if (!(init.body instanceof FormData)) {
        retryHeaders.set("Content-Type", "application/json");
      }
      const token = localStorage.getItem("access_token");
      if (token) retryHeaders.set("Authorization", `Bearer ${token}`);
      const guest = localStorage.getItem("guest_id");
      if (guest) retryHeaders.set("X-Guest-ID", guest);
      res = await fetch(resolve(path), { ...init, headers: retryHeaders, cache: "no-store" });
    }
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export type Product = {
  id: string;
  slug: string;
  translations: Record<string, { name?: string; description?: string }>;
  price: number;
  compare_at_price?: number | null;
  currency: string;
  images?: string[] | unknown;
  inventory_quantity?: number;
  vendor_id?: string | null;
  category_id?: string | null;
  created_at?: string;
  rating?: number;
  review_count?: number;
};

export function productImage(p: Product): string | undefined {
  return Array.isArray(p.images) && typeof p.images[0] === "string" ? p.images[0] : undefined;
}

export type Variant = {
  id: string;
  product_id?: string;
  sku?: string;
  title: string;
  price: number;
  inventory_quantity?: number;
  image_url?: string | null;
  attributes?: Record<string, unknown> | unknown;
  status?: string;
};

/** Collect image URLs attached to a variant (cover + attributes.images). */
export function variantImageList(variant: Variant | null | undefined): string[] {
  if (!variant) return [];
  const out: string[] = [];
  if (typeof variant.image_url === "string" && variant.image_url) {
    out.push(variant.image_url);
  }
  const attrs = variant.attributes;
  if (attrs && typeof attrs === "object" && !Array.isArray(attrs)) {
    const record = attrs as Record<string, unknown>;
    const push = (v: unknown) => {
      if (typeof v === "string" && v) out.push(v);
    };
    push(record.image);
    push(record.image_url);
    const images = record.images;
    if (typeof images === "string") push(images);
    if (Array.isArray(images)) images.forEach(push);
  }
  return [...new Set(out)];
}

/**
 * Gallery set for the selected variant:
 * - variant-only photos lead, then remaining product photos
 * - if variant cover is already in product gallery, keep full set and jump to it
 */
export function resolveGalleryImages(
  productImages: string[],
  variant: Variant | null | undefined
): { images: string[]; focusIndex: number } {
  const base = productImages.filter((u) => typeof u === "string" && u.length > 0);
  const vImgs = variantImageList(variant);
  if (vImgs.length === 0) {
    return { images: base, focusIndex: 0 };
  }
  if (vImgs.every((u) => base.includes(u))) {
    return { images: base, focusIndex: Math.max(0, base.indexOf(vImgs[0])) };
  }
  const rest = base.filter((u) => !vImgs.includes(u));
  return { images: [...vImgs, ...rest], focusIndex: 0 };
}

export function productName(p: Product, locale: string): string {
  return p.translations?.[locale]?.name || p.translations?.uz?.name || p.slug;
}
