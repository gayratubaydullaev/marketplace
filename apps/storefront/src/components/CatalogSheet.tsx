"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";

export type CatalogCat = {
  id: string;
  slug: string;
  parent_id?: string | null;
  translations?: Record<string, { name?: string }>;
  sort_order?: number;
};

export function catName(c: CatalogCat, locale: string) {
  return c.translations?.[locale]?.name || c.translations?.uz?.name || c.slug;
}

export function useCategoryTree() {
  const [cats, setCats] = useState<CatalogCat[]>([]);

  useEffect(() => {
    api<{ items: CatalogCat[] }>("/v1/categories")
      .then((d) => setCats(d.items || []))
      .catch(() => setCats([]));
  }, []);

  const roots = useMemo(
    () =>
      cats
        .filter((c) => !c.parent_id)
        .slice()
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    [cats]
  );

  const childrenOf = useMemo(() => {
    const map = new Map<string, CatalogCat[]>();
    for (const c of cats) {
      if (!c.parent_id) continue;
      const list = map.get(c.parent_id) || [];
      list.push(c);
      map.set(c.parent_id, list);
    }
    for (const [, list] of map) {
      list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    }
    return map;
  }, [cats]);

  return { cats, roots, childrenOf };
}

/** Mobile catalog sheet: categories → tap to open subcategories → navigate. */
export function CatalogSheet({
  locale,
  open,
  onClose,
}: {
  locale: string;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations();
  const { roots, childrenOf } = useCategoryTree();
  const [activeRoot, setActiveRoot] = useState<CatalogCat | null>(null);

  useEffect(() => {
    if (!open) setActiveRoot(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (activeRoot) setActiveRoot(null);
        else onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, activeRoot, onClose]);

  if (!open) return null;

  const kids = activeRoot ? childrenOf.get(activeRoot.id) || [] : [];

  return (
    <div className="fixed inset-0 z-[80] md:hidden" role="dialog" aria-modal="true" aria-label={t("nav.catalog")}>
      <button
        type="button"
        className="absolute inset-0 bg-night/45 backdrop-blur-[2px]"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        className="absolute inset-x-0 bottom-0 flex max-h-[min(78dvh,560px)] flex-col rounded-t-3xl bg-paper shadow-[0_-18px_50px_-24px_rgba(11,31,36,0.45)]"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center gap-2 border-b border-night/8 px-4 py-3">
          {activeRoot ? (
            <button
              type="button"
              onClick={() => setActiveRoot(null)}
              className="flex h-9 w-9 items-center justify-center rounded-full text-night/70 hover:bg-night/5"
              aria-label="Back"
            >
              ‹
            </button>
          ) : (
            <span className="w-9" />
          )}
          <p className="flex-1 text-center font-display text-base font-bold text-night">
            {activeRoot ? catName(activeRoot, locale) : t("nav.catalog")}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-night/50 hover:bg-night/5"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
          {!activeRoot ? (
            <ul>
              {roots.map((root) => {
                const hasKids = (childrenOf.get(root.id) || []).length > 0;
                return (
                  <li key={root.id}>
                    {hasKids ? (
                      <button
                        type="button"
                        onClick={() => setActiveRoot(root)}
                        className="flex w-full items-center justify-between rounded-xl px-3 py-3.5 text-start text-[15px] font-semibold text-night active:bg-teal/10"
                      >
                        <span>{catName(root, locale)}</span>
                        <span className="text-muted">›</span>
                      </button>
                    ) : (
                      <Link
                        href={`/${locale}/categories/${root.slug}`}
                        onClick={onClose}
                        className="flex w-full items-center justify-between rounded-xl px-3 py-3.5 text-[15px] font-semibold text-night active:bg-teal/10"
                      >
                        <span>{catName(root, locale)}</span>
                      </Link>
                    )}
                  </li>
                );
              })}
              <li className="mt-1 border-t border-night/8 px-1 pt-2">
                <Link
                  href={`/${locale}/products`}
                  onClick={onClose}
                  className="block rounded-xl px-3 py-3 text-sm font-bold uppercase tracking-wide text-muted active:bg-teal/10 active:text-teal"
                >
                  {t("home.shopAll")}
                </Link>
              </li>
            </ul>
          ) : (
            <ul>
              <li>
                <Link
                  href={`/${locale}/categories/${activeRoot.slug}`}
                  onClick={onClose}
                  className="mb-1 flex w-full items-center rounded-xl px-3 py-3 text-[15px] font-bold text-teal active:bg-teal/10"
                >
                  {catName(activeRoot, locale)} — {t("home.shopAll")}
                </Link>
              </li>
              {kids.map((child) => (
                <li key={child.id}>
                  <Link
                    href={`/${locale}/categories/${child.slug}`}
                    onClick={onClose}
                    className="flex w-full items-center rounded-xl px-3 py-3.5 text-[15px] font-medium text-night/85 active:bg-teal/10 active:text-teal"
                  >
                    {catName(child, locale)}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
