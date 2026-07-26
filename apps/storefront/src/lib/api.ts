import { rewriteMediaUrl, rewriteMediaUrls } from "@/lib/media";

export const TENANT_ID =
  process.env.NEXT_PUBLIC_TENANT_ID || "00000000-0000-0000-0000-000000000001";

/** Single gateway entry (Kong / Next rewrites). No per-service ports. */
const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8080").replace(/\/$/, "");

function resolve(path: string) {
  const p = path.startsWith("/") ? path : `/${path}`;
  // Browser: same-origin `/v1/*` (Next rewrites → gateway). Avoids CORS and
  // broken `localhost:8080` when the storefront is opened via LAN IP on a phone.
  if (typeof window !== "undefined") return p;
  return `${API_BASE}${p}`;
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
  sku?: string | null;
  attributes?: Record<string, unknown> | unknown;
  is_featured?: boolean;
  created_at?: string;
  rating?: number;
  review_count?: number;
  sales_count?: number;
};

export type ProductBadge = {
  kind: "sale" | "new" | "hit" | "low";
  labelKey: "badgeSale" | "badgeNew" | "badgeHit" | "badgeLowStock";
  /** For sale badge: percent off */
  percent?: number;
};

const NEW_DAYS = 30;

function asMoney(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Resolve up to 2 marketplace badges for a product card. */
export function productBadges(product: Product, now = Date.now()): ProductBadge[] {
  const badges: ProductBadge[] = [];
  const price = asMoney(product.price) ?? 0;
  const compareRaw = asMoney(product.compare_at_price);
  const compare = compareRaw != null && compareRaw > price ? compareRaw : null;
  if (compare != null && price > 0) {
    const percent = Math.round((1 - price / compare) * 100);
    if (percent > 0) {
      badges.push({ kind: "sale", labelKey: "badgeSale", percent });
    }
  }

  if (product.is_featured) {
    badges.push({ kind: "hit", labelKey: "badgeHit" });
  }

  if (product.created_at) {
    const created = new Date(product.created_at).getTime();
    if (!Number.isNaN(created) && now - created < NEW_DAYS * 24 * 60 * 60 * 1000) {
      badges.push({ kind: "new", labelKey: "badgeNew" });
    }
  }

  const stock = product.inventory_quantity;
  if (typeof stock === "number" && stock > 0 && stock <= 5) {
    badges.push({ kind: "low", labelKey: "badgeLowStock" });
  }

  // Prefer sale + one secondary; avoid overcrowding
  const sale = badges.find((b) => b.kind === "sale");
  const rest = badges.filter((b) => b.kind !== "sale");
  if (sale) return [sale, ...rest].slice(0, 2);
  return badges.slice(0, 2);
}

export function productCompareAt(product: Product): number | null {
  const price = asMoney(product.price);
  const compare = asMoney(product.compare_at_price);
  if (price == null || compare == null) return null;
  return compare > price ? compare : null;
}

export function productDiscountPercent(product: Product): number {
  const price = asMoney(product.price);
  const compare = productCompareAt(product);
  if (price == null || compare == null || compare <= 0) return 0;
  return Math.max(0, Math.round((1 - price / compare) * 100));
}

/** Flatten product.attributes into display rows (skips nested/media keys). */
export function productAttributeRows(
  attributes: Product["attributes"]
): { key: string; value: string }[] {
  if (!attributes || typeof attributes !== "object" || Array.isArray(attributes)) return [];
  const skip = new Set(["images", "image", "image_url", "gallery"]);
  const rows: { key: string; value: string }[] = [];
  for (const [key, raw] of Object.entries(attributes as Record<string, unknown>)) {
    if (skip.has(key.toLowerCase()) || raw == null || raw === "") continue;
    if (typeof raw === "object") continue;
    rows.push({ key, value: String(raw) });
  }
  return rows;
}

export function productImage(p: Product): string | undefined {
  if (!Array.isArray(p.images) || typeof p.images[0] !== "string") return undefined;
  return rewriteMediaUrl(p.images[0], { fallbackKey: p.id || p.slug });
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
  return rewriteMediaUrls([...new Set(out)], { fallbackKey: variant.id || variant.sku || "variant" });
}

/**
 * Gallery set for the selected variant:
 * - variant-only photos lead, then remaining product photos
 * - if variant cover is already in product gallery, keep full set and jump to it
 * Preserves duplicate URLs so multi-slot galleries (e.g. seeded identical paths) still show a thumb strip.
 */
export function resolveGalleryImages(
  productImages: string[],
  variant: Variant | null | undefined
): { images: string[]; focusIndex: number } {
  const base = rewriteMediaUrls(
    productImages.filter((u) => typeof u === "string" && u.length > 0),
    { fallbackKey: "product", unique: false }
  );
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
