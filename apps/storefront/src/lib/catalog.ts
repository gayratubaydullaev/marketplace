import { cache } from "react";
import { apiPublic, publicTags, type Product } from "@/lib/api";

export type CategoryItem = {
  id: string;
  slug: string;
  parent_id?: string | null;
  image_url?: string | null;
  translations?: Record<string, { name?: string }>;
  sort_order?: number;
};

/** Deduped within a single RSC request + Next Data Cache across requests. */
export const getCategories = cache(async (): Promise<CategoryItem[]> => {
  try {
    const data = await apiPublic<{ items: CategoryItem[] }>("/v1/categories", {
      revalidate: 120,
      tags: publicTags("categories"),
    });
    return data.items || [];
  } catch {
    return [];
  }
});

export const getProductBySlug = cache(async (slug: string) => {
  return apiPublic<{
    product: Product;
    variants?: unknown;
    rating?: number;
    review_count?: number;
    json_ld?: Record<string, unknown>;
  }>(`/v1/products/${slug}`, {
    revalidate: 60,
    tags: publicTags("products", `product:${slug}`),
  });
});

export async function getHomeFeed(limit = 24) {
  try {
    return await apiPublic<{ items: Product[]; total?: number }>(
      `/v1/products?sort=home&limit=${limit}&page=1`,
      { revalidate: 60, tags: publicTags("products", "home") }
    );
  } catch {
    return apiPublic<{ items: Product[]; total?: number }>(
      `/v1/products?limit=${limit}&page=1`,
      { revalidate: 60, tags: publicTags("products", "home") }
    );
  }
}

export async function getHomeBanners() {
  try {
    return await apiPublic<{ items: { id: string; image_url: string; cta_href?: string; interval_sec?: number }[] }>(
      "/v1/home/banners",
      { revalidate: 60, tags: publicTags("home") }
    );
  } catch {
    return { items: [] };
  }
}

export async function getHomePromos() {
  try {
    return await apiPublic<{ items: { id: string; image_url: string; cta_href?: string; interval_sec?: number }[] }>(
      "/v1/home/promo-banners",
      { revalidate: 60, tags: publicTags("home") }
    );
  } catch {
    return { items: [] };
  }
}

export async function getSearchFacets() {
  try {
    return await apiPublic<{
      price_ranges?: { min: number; max: number }[];
      brands?: string[];
      attributes?: Record<string, string[]>;
    }>("/v1/search/facets", {
      revalidate: 120,
      tags: publicTags("facets"),
    });
  } catch {
    return {};
  }
}

export async function getVendorById(id: string) {
  // List is cached; filter client-side until a by-id route exists.
  try {
    const data = await apiPublic<{ items: { id: string; name: string; slug: string; rating?: number }[] }>(
      "/v1/vendors",
      { revalidate: 120, tags: publicTags("vendors") }
    );
    return (data.items || []).find((v) => v.id === id) || null;
  } catch {
    return null;
  }
}

/** Shared in-flight popular queries (browser) — one request for dual HeaderSearch mounts. */
let popularInflight: Promise<string[]> | null = null;

export function fetchPopularQueries(): Promise<string[]> {
  if (typeof window === "undefined") {
    return apiPublic<{ items?: { query: string }[] }>("/v1/search/popular", {
      revalidate: 300,
      tags: publicTags("search-popular"),
    })
      .then((d) => (d.items || []).map((i) => i.query).filter(Boolean))
      .catch(() => []);
  }
  if (!popularInflight) {
    popularInflight = apiPublic<{ items?: { query: string }[] }>("/v1/search/popular", {
      revalidate: 300,
      tags: publicTags("search-popular"),
    })
      .then((d) => (d.items || []).map((i) => i.query).filter(Boolean))
      .catch(() => [] as string[])
      .finally(() => {
        // Keep result warm briefly; allow refresh after idle
        setTimeout(() => {
          popularInflight = null;
        }, 60_000);
      });
  }
  return popularInflight;
}
