import {
  gatewayPath,
  hasClientSessionFlag as flagFor,
  logoutSession as logoutShared,
} from "@gayrat/web-session/client";
import { rewriteMediaUrl, rewriteMediaUrls } from "@/lib/media";

export const TENANT_ID =
  process.env.NEXT_PUBLIC_TENANT_ID || "00000000-0000-0000-0000-000000000001";

const SESSION_PREFIX = "gm";

/**
 * Browser calls same-origin BFF (`/api/gateway/*`) which holds httpOnly
 * access/refresh/guest cookies and injects Authorization / X-Guest-ID.
 * Tokens never live in localStorage.
 */
function resolve(path: string) {
  const p = path.startsWith("/") ? path : `/${path}`;
  if (typeof window !== "undefined") return gatewayPath(p);
  const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8080").replace(/\/$/, "");
  return `${API_BASE}${p}`;
}

/** Same-origin gateway URL for downloads / new-tab links (invoice, etc.). */
export function apiUrl(path: string): string {
  return resolve(path);
}

/** Soft UI signal that cookies were set (not a secret). */
export function hasClientSessionFlag(): boolean {
  return flagFor(SESSION_PREFIX);
}

export async function logoutSession(): Promise<void> {
  await logoutShared();
}

type FetchOpts = RequestInit & {
  /** Public catalog/home reads — Next Data Cache. Private stays no-store via api(). */
  revalidate?: number;
  tags?: string[];
};

function tenantTag(kind: string) {
  return `t:${TENANT_ID}:${kind}`;
}

export function publicTags(...kinds: string[]) {
  return kinds.map(tenantTag);
}

async function request<T>(path: string, init: FetchOpts = {}): Promise<T> {
  const { revalidate, tags, ...rest } = init;
  const headers = new Headers(rest.headers);
  headers.set("X-Tenant-ID", TENANT_ID);
  if (!(rest.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  headers.delete("Authorization");
  headers.delete("X-Guest-ID");
  headers.delete("X-Internal-Key");

  const cacheMode =
    typeof revalidate === "number"
      ? undefined
      : ("no-store" as RequestCache);

  const res = await fetch(resolve(path), {
    ...rest,
    headers,
    ...(cacheMode ? { cache: cacheMode } : {}),
    ...(typeof revalidate === "number"
      ? { next: { revalidate, tags: tags?.length ? tags : undefined } }
      : {}),
    credentials: "same-origin",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

/** Authenticated / mutable endpoints — never cached. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  return request<T>(path, init);
}

/** Public catalog/home/search reads — cached per tenant. */
export async function apiPublic<T>(
  path: string,
  init: Omit<FetchOpts, "cache"> & { revalidate?: number; tags?: string[] } = {}
): Promise<T> {
  const { revalidate = 60, tags, ...rest } = init;
  return request<T>(path, { ...rest, revalidate, tags });
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
