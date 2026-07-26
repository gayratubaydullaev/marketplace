export type FilterState = {
  q?: string;
  category?: string; // slug (catalog)
  category_id?: string; // uuid (search)
  sort?: string;
  min?: string;
  max?: string;
  featured?: string; // "1"
  on_sale?: string;
  in_stock?: string;
  page?: string;
};

export const DEFAULT_PRICE_RANGES = [
  { min: 0, max: 100_000 },
  { min: 100_000, max: 500_000 },
  { min: 500_000, max: 2_000_000 },
  { min: 2_000_000, max: 10_000_000 },
];

export function buildFilterHref(basePath: string, current: FilterState, patch: Partial<FilterState>) {
  const merged: FilterState = { ...current, ...patch };
  if (!("page" in patch)) {
    delete merged.page;
  } else if (!patch.page) {
    delete merged.page;
  }
  (Object.keys(patch) as (keyof FilterState)[]).forEach((key) => {
    if (patch[key] === undefined) delete merged[key];
  });

  const params = new URLSearchParams();
  (Object.keys(merged) as (keyof FilterState)[]).forEach((key) => {
    const v = merged[key];
    if (v) params.set(key, v);
  });
  const s = params.toString();
  return s ? `${basePath}?${s}` : basePath;
}

export function countActiveFilters(state: FilterState, opts?: { ignoreSort?: boolean }) {
  let n = 0;
  if (state.category || state.category_id) n += 1;
  if (state.min || state.max) n += 1;
  if (state.featured) n += 1;
  if (state.on_sale) n += 1;
  if (state.in_stock) n += 1;
  if (!opts?.ignoreSort && state.sort && state.sort !== "relevance") n += 1;
  return n;
}

export function formatFilterPrice(n: number, locale: string) {
  try {
    return new Intl.NumberFormat(locale === "uz" ? "uz-UZ" : locale, {
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return String(n);
  }
}

export function priceRangeLabel(min: number, max: number, locale: string) {
  return `${formatFilterPrice(min, locale)} – ${formatFilterPrice(max, locale)}`;
}
