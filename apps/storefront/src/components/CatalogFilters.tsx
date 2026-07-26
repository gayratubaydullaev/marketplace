"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  buildFilterHref,
  type FilterState,
  formatFilterPrice,
  priceRangeLabel,
  DEFAULT_PRICE_RANGES,
} from "@/lib/filters";

export type FilterCategory = {
  id?: string;
  slug: string;
  parent_id?: string | null;
  translations?: Record<string, { name?: string }>;
};

export function CatalogFilters({
  locale,
  basePath,
  values,
  categories = [],
  mode = "catalog",
  priceRanges = DEFAULT_PRICE_RANGES,
  facetCounts,
  showCategories = true,
}: {
  locale: string;
  basePath: string;
  values: FilterState;
  categories?: FilterCategory[];
  mode?: "catalog" | "search" | "category";
  priceRanges?: { min: number; max: number }[];
  facetCounts?: Map<string, number> | Record<string, number>;
  showCategories?: boolean;
}) {
  const t = useTranslations("catalog");
  const href = (patch: Partial<FilterState>) => buildFilterHref(basePath, values, patch);

  const roots = categories.filter((c) => !c.parent_id);

  const countOf = (id?: string) => {
    if (!id || !facetCounts) return undefined;
    if (facetCounts instanceof Map) return facetCounts.get(id);
    return facetCounts[id];
  };

  const activeCatSlug = values.category;
  const activeCatId = values.category_id;

  const searchCats =
    mode === "search"
      ? categories
          .filter((c) => c.id)
          .filter((c) => {
            const n = countOf(c.id);
            return activeCatId === c.id || typeof n === "number";
          })
          .sort((a, b) => (countOf(b.id) || 0) - (countOf(a.id) || 0))
          .slice(0, 20)
      : [];

  return (
    <div className="space-y-6">
      {showCategories && mode !== "category" ? (
        <section>
          <h3 className="text-sm font-bold uppercase tracking-wide text-muted">{t("categories")}</h3>
          <ul className="mt-2 space-y-0.5 text-sm">
            <li>
              <Link
                href={href({ category: undefined, category_id: undefined })}
                className={rowClass(!activeCatSlug && !activeCatId)}
              >
                {t("all")}
              </Link>
            </li>
            {mode === "search"
              ? searchCats.map((c) => {
                  const count = countOf(c.id);
                  const active = activeCatId === c.id;
                  return (
                    <li key={c.id}>
                      <Link
                        href={href({ category_id: active ? undefined : c.id })}
                        className={rowClass(active)}
                      >
                        <span className="min-w-0 flex-1 truncate">
                          {c.translations?.[locale]?.name || c.translations?.uz?.name || c.slug}
                        </span>
                        {typeof count === "number" ? (
                          <span className="shrink-0 tabular-nums text-muted">{count}</span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })
              : roots.map((c) => (
                  <li key={c.slug}>
                    <Link
                      href={href({ category: activeCatSlug === c.slug ? undefined : c.slug })}
                      className={rowClass(activeCatSlug === c.slug)}
                    >
                      {c.translations?.[locale]?.name || c.translations?.uz?.name || c.slug}
                    </Link>
                  </li>
                ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h3 className="text-sm font-bold uppercase tracking-wide text-muted">{t("price")}</h3>
        <ul className="mt-2 space-y-0.5 text-sm">
          {priceRanges.map((r) => {
            const active = values.min === String(r.min) && values.max === String(r.max);
            return (
              <li key={`${r.min}-${r.max}`}>
                <Link
                  href={href(
                    active
                      ? { min: undefined, max: undefined }
                      : { min: String(r.min), max: String(r.max) }
                  )}
                  className={rowClass(active)}
                >
                  {priceRangeLabel(r.min, r.max, locale)}
                </Link>
              </li>
            );
          })}
        </ul>
        <PriceCustomForm locale={locale} basePath={basePath} values={values} />
      </section>

      <section>
        <h3 className="text-sm font-bold uppercase tracking-wide text-muted">{t("quickFilters")}</h3>
        <ul className="mt-2 space-y-0.5 text-sm">
          <ToggleRow
            href={href({ featured: values.featured ? undefined : "1" })}
            active={Boolean(values.featured)}
            label={t("filterFeatured")}
          />
          <ToggleRow
            href={href({ on_sale: values.on_sale ? undefined : "1" })}
            active={Boolean(values.on_sale)}
            label={t("filterOnSale")}
          />
          <ToggleRow
            href={href({ in_stock: values.in_stock ? undefined : "1" })}
            active={Boolean(values.in_stock)}
            label={t("filterInStock")}
          />
        </ul>
      </section>
    </div>
  );
}

function rowClass(active: boolean) {
  return `flex items-center justify-between gap-2 rounded-lg px-3 py-2 transition ${
    active ? "bg-accent-muted font-semibold text-teal" : "text-night/85 hover:bg-night/4"
  }`;
}

function ToggleRow({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <li>
      <Link href={href} className={rowClass(active)} aria-pressed={active}>
        <span>{label}</span>
        <span
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[11px] ${
            active ? "border-teal bg-teal text-paper" : "border-night/20 text-transparent"
          }`}
          aria-hidden
        >
          ✓
        </span>
      </Link>
    </li>
  );
}

function PriceCustomForm({
  locale,
  basePath,
  values,
}: {
  locale: string;
  basePath: string;
  values: FilterState;
}) {
  const t = useTranslations("catalog");
  const router = useRouter();
  const [lo, setLo] = useState(values.min || "");
  const [hi, setHi] = useState(values.max || "");

  useEffect(() => {
    setLo(values.min || "");
    setHi(values.max || "");
  }, [values.min, values.max]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const a = lo.replace(/\s/g, "").trim();
    const b = hi.replace(/\s/g, "").trim();
    router.push(
      buildFilterHref(basePath, values, {
        min: a || undefined,
        max: b || undefined,
      })
    );
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-2 rounded-xl border border-night/8 bg-white/70 p-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted">{t("priceCustom")}</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="sr-only">{t("priceFrom")}</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={1000}
            placeholder={t("priceFrom")}
            value={lo}
            onChange={(e) => setLo(e.target.value)}
            className="w-full rounded-lg border border-night/12 bg-white px-2.5 py-2 text-sm outline-none focus:border-teal"
          />
        </label>
        <label className="block">
          <span className="sr-only">{t("priceTo")}</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            step={1000}
            placeholder={t("priceTo")}
            value={hi}
            onChange={(e) => setHi(e.target.value)}
            className="w-full rounded-lg border border-night/12 bg-white px-2.5 py-2 text-sm outline-none focus:border-teal"
          />
        </label>
      </div>
      <button
        type="submit"
        className="w-full rounded-lg bg-night/5 py-2 text-xs font-bold text-night transition hover:bg-teal/10 hover:text-teal"
      >
        {t("priceApply")}
      </button>
      {values.min || values.max ? (
        <p className="text-[11px] text-muted">
          {values.min ? formatFilterPrice(Number(values.min), locale) : "…"} –{" "}
          {values.max ? formatFilterPrice(Number(values.max), locale) : "…"}
        </p>
      ) : null}
    </form>
  );
}

export function ActiveFilterChips({
  locale,
  basePath,
  values,
  categories = [],
  clearHref,
}: {
  locale: string;
  basePath: string;
  values: FilterState;
  categories?: FilterCategory[];
  clearHref: string;
}) {
  const t = useTranslations("catalog");
  const chips: { key: string; label: string; href: string }[] = [];
  const href = (patch: Partial<FilterState>) => buildFilterHref(basePath, values, patch);

  if (values.category) {
    const c = categories.find((x) => x.slug === values.category);
    chips.push({
      key: "category",
      label: c?.translations?.[locale]?.name || c?.translations?.uz?.name || values.category,
      href: href({ category: undefined }),
    });
  }
  if (values.category_id) {
    const c = categories.find((x) => x.id === values.category_id);
    chips.push({
      key: "category_id",
      label: c?.translations?.[locale]?.name || c?.translations?.uz?.name || values.category_id.slice(0, 8),
      href: href({ category_id: undefined }),
    });
  }
  if (values.min || values.max) {
    const a = values.min ? formatFilterPrice(Number(values.min), locale) : "…";
    const b = values.max ? formatFilterPrice(Number(values.max), locale) : "…";
    chips.push({
      key: "price",
      label: `${a} – ${b}`,
      href: href({ min: undefined, max: undefined }),
    });
  }
  if (values.featured) {
    chips.push({ key: "featured", label: t("filterFeatured"), href: href({ featured: undefined }) });
  }
  if (values.on_sale) {
    chips.push({ key: "on_sale", label: t("filterOnSale"), href: href({ on_sale: undefined }) });
  }
  if (values.in_stock) {
    chips.push({ key: "in_stock", label: t("filterInStock"), href: href({ in_stock: undefined }) });
  }

  if (chips.length === 0) return null;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {chips.map((c) => (
        <Link
          key={c.key}
          href={c.href}
          className="inline-flex items-center gap-1.5 rounded-full border border-teal/25 bg-teal/8 px-3 py-1 text-xs font-semibold text-teal transition hover:bg-teal/15"
        >
          {c.label}
          <span aria-hidden className="text-teal/60">
            ×
          </span>
        </Link>
      ))}
      <Link href={clearHref} className="text-xs font-bold text-muted underline-offset-2 hover:text-teal hover:underline">
        {t("clearFilters")}
      </Link>
    </div>
  );
}
