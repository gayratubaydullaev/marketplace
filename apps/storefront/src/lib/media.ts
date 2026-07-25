/** Local product placeholders (served from storefront /public/products). */
export const LOCAL_PRODUCT_IMAGES = [
  "/products/prod-phone-samsung.jpg",
  "/products/prod-phone-xiaomi.jpg",
  "/products/prod-earbuds.jpg",
  "/products/prod-laptop.jpg",
  "/products/prod-speaker.jpg",
  "/products/prod-jacket.jpg",
  "/products/prod-tshirt.jpg",
  "/products/prod-sneakers.jpg",
  "/products/prod-sweater.jpg",
  "/products/prod-trousers.jpg",
  "/products/prod-blender.jpg",
  "/products/prod-kettle.jpg",
  "/products/prod-pillows.jpg",
  "/products/prod-robot-vac.jpg",
  "/products/prod-breadmaker.jpg",
  "/products/p1.svg",
  "/products/p2.svg",
  "/products/p3.svg",
  "/products/p4.svg",
  "/products/p5.svg",
  "/products/p6.svg",
  "/products/p7.svg",
  "/products/p8.svg",
  "/products/p9.svg",
  "/products/p10.svg",
] as const;

export const LOCAL_HERO_IMAGES = [
  "/hero/hero-market.jpg",
  "/hero/hero-delivery.jpg",
  "/hero/hero-home.jpg",
  "/hero/hero-promo.jpg",
] as const;

function hashString(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h * 31 + input.charCodeAt(i)) >>> 0;
  return h;
}

function pickLocal(list: readonly string[], key: string): string {
  return list[hashString(key) % list.length];
}

/** True when URL depends on an unreliable external CDN. */
export function isUnreliableMediaUrl(url: string): boolean {
  return /^https?:\/\/images\.unsplash\.com\//i.test(url.trim());
}

/**
 * Rewrite Unsplash (and empty) URLs to stable local assets so SSR/CSR
 * never block on external CDNs. Prefer compressed .jpg siblings for heavy demo PNGs.
 */
export function rewriteMediaUrl(
  url: string | null | undefined,
  opts?: { kind?: "product" | "hero"; fallbackKey?: string }
): string {
  let value = (url || "").trim();
  const kind = opts?.kind || "product";
  const list = kind === "hero" ? LOCAL_HERO_IMAGES : LOCAL_PRODUCT_IMAGES;
  if (!value || isUnreliableMediaUrl(value)) {
    return pickLocal(list, opts?.fallbackKey || value || "default");
  }
  // Demo assets: use lightweight JPEG counterparts when present in /public.
  if (
    value.startsWith("/products/prod-") || value.startsWith("/hero/hero-")
  ) {
    value = value.replace(/\.png$/i, ".jpg");
  }
  return value;
}

export function rewriteMediaUrls(
  urls: Array<string | null | undefined>,
  opts?: { kind?: "product" | "hero"; fallbackKey?: string }
): string[] {
  const out: string[] = [];
  for (let i = 0; i < urls.length; i++) {
    const rewritten = rewriteMediaUrl(urls[i], {
      kind: opts?.kind,
      fallbackKey: `${opts?.fallbackKey || "img"}:${i}:${urls[i] || ""}`,
    });
    if (rewritten && !out.includes(rewritten)) out.push(rewritten);
  }
  return out;
}
