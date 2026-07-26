"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";

export type CatalogCat = {
  id: string;
  slug: string;
  parent_id?: string | null;
  translations?: Record<string, { name?: string }>;
  sort_order?: number;
};

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

export function catName(c: CatalogCat, locale: string) {
  return c.translations?.[locale]?.name || c.translations?.uz?.name || c.slug;
}

function isRootCat(c: CatalogCat) {
  const p = c.parent_id;
  return p == null || p === "" || p === NIL_UUID;
}

export function useCategoryTree(initial: CatalogCat[] = []) {
  const seedKey = initial.map((c) => c.id).join(",");
  const [cats, setCats] = useState<CatalogCat[]>(initial);
  const [status, setStatus] = useState<"idle" | "loading" | "error">(
    initial.length > 0 ? "idle" : "loading"
  );

  useEffect(() => {
    if (initial.length > 0) {
      setCats(initial);
      setStatus("idle");
      return;
    }
    let cancelled = false;
    setStatus("loading");
    void api<{ items: CatalogCat[] }>("/v1/categories")
      .then((d) => {
        if (cancelled) return;
        setCats(d.items || []);
        setStatus("idle");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
    // seedKey captures SSR category identity without relying on array reference
  }, [seedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const roots = useMemo(() => {
    const filtered = cats.filter(isRootCat);
    const list = filtered.length > 0 ? filtered : cats;
    return list.slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  }, [cats]);

  const childrenOf = useMemo(() => {
    const map = new Map<string, CatalogCat[]>();
    for (const c of cats) {
      if (isRootCat(c) || !c.parent_id) continue;
      const list = map.get(c.parent_id) || [];
      list.push(c);
      map.set(c.parent_id, list);
    }
    for (const [, list] of map) {
      list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    }
    return map;
  }, [cats]);

  return {
    cats,
    roots,
    childrenOf,
    status,
    reload: () => {
      setStatus("loading");
      void api<{ items: CatalogCat[] }>("/v1/categories")
        .then((d) => {
          setCats(d.items || []);
          setStatus("idle");
        })
        .catch(() => setStatus(cats.length > 0 ? "idle" : "error"));
    },
  };
}

/** Mobile catalog sheet: categories → tap to open subcategories → navigate. */
export function CatalogSheet({
  locale,
  open,
  onClose,
  initialCategories = [],
}: {
  locale: string;
  open: boolean;
  onClose: () => void;
  initialCategories?: CatalogCat[];
}) {
  const t = useTranslations();
  const { roots, childrenOf, status, reload } = useCategoryTree(initialCategories);
  const [activeRoot, setActiveRoot] = useState<CatalogCat | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) setActiveRoot(null);
    else if (roots.length === 0) reload();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- refetch only when opening empty

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

  if (!mounted || !open) return null;

  const kids = activeRoot ? childrenOf.get(activeRoot.id) || [] : [];

  return createPortal(
    <div
      className="fixed inset-0 z-[100] md:hidden"
      role="dialog"
      aria-modal="true"
      aria-label={t("nav.catalog")}
    >
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
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-night/15" aria-hidden />
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
              {roots.length === 0 && status === "loading" ? (
                <li className="px-3 py-8 text-center text-sm text-muted">{t("common.loading")}</li>
              ) : null}
              {roots.length === 0 && status === "error" ? (
                <li className="px-3 py-6 text-center">
                  <p className="text-sm text-muted">{t("common.error")}</p>
                  <button
                    type="button"
                    onClick={() => reload()}
                    className="mt-2 text-sm font-bold text-teal"
                  >
                    {t("common.retry")}
                  </button>
                </li>
              ) : null}
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
    </div>,
    document.body
  );
}
