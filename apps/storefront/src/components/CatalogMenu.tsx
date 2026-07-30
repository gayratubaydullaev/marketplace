"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { apiPublic, publicTags } from "@/lib/api";

type Cat = {
  id: string;
  slug: string;
  parent_id?: string | null;
  translations?: Record<string, { name?: string }>;
  sort_order?: number;
};

function catName(c: Cat, locale: string) {
  return c.translations?.[locale]?.name || c.translations?.uz?.name || c.slug;
}

export function CatalogMenu({
  locale,
  initialCategories = [],
}: {
  locale: string;
  initialCategories?: Cat[];
}) {
  const t = useTranslations();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [cats, setCats] = useState<Cat[]>(initialCategories);
  const [hoverRoot, setHoverRoot] = useState<string | null>(null);

  useEffect(() => {
    if (initialCategories.length > 0) {
      setCats(initialCategories);
      return;
    }
    apiPublic<{ items: Cat[] }>("/v1/categories", {
      revalidate: 120,
      tags: publicTags("categories"),
    })
      .then((d) => setCats(d.items || []))
      .catch(() => setCats([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed by ids only
  }, [initialCategories.map((c) => c.id).join(",")]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setHoverRoot(null);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setHoverRoot(null);
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const roots = useMemo(
    () =>
      cats
        .filter((c) => !c.parent_id)
        .slice()
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    [cats]
  );

  const childrenOf = useMemo(() => {
    const map = new Map<string, Cat[]>();
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

  // Subcategories only after hover — never pre-select first root.
  const flyout = hoverRoot ? childrenOf.get(hoverRoot) || [] : [];
  const showFlyout = Boolean(hoverRoot) && flyout.length > 0;

  function toggleOpen() {
    setOpen((v) => {
      if (v) setHoverRoot(null);
      return !v;
    });
  }

  return (
    <div ref={rootRef} className="relative hidden shrink-0 md:block">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={toggleOpen}
        className={`inline-flex h-11 items-center gap-2 rounded-xl px-3.5 text-sm font-bold transition ${
          open
            ? "bg-teal text-paper shadow-sm"
            : "border border-night/12 bg-white text-night hover:border-teal/40 hover:text-teal"
        }`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
        </svg>
        {t("nav.catalog")}
        <span className={`text-[10px] transition ${open ? "rotate-180" : ""}`}>▾</span>
      </button>

      {open ? (
        <div
          className="absolute start-0 top-[calc(100%+0.5rem)] z-50 flex overflow-hidden rounded-2xl border border-night/10 bg-white shadow-[0_24px_60px_-28px_rgba(11,31,36,0.45)]"
          onMouseLeave={() => setHoverRoot(null)}
        >
          <ul className="min-w-[14rem] py-2" role="menu">
            {roots.map((root) => {
              const kids = childrenOf.get(root.id) || [];
              const active = root.id === hoverRoot;
              return (
                <li key={root.id} role="none">
                  <div
                    className={`flex items-center ${active ? "bg-teal/8" : "hover:bg-night/4"}`}
                    onMouseEnter={() => setHoverRoot(root.id)}
                  >
                    <Link
                      href={`/${locale}/categories/${root.slug}`}
                      role="menuitem"
                      onClick={() => {
                        setOpen(false);
                        setHoverRoot(null);
                      }}
                      className={`flex flex-1 items-center justify-between px-4 py-2.5 text-sm font-semibold transition ${
                        active ? "text-teal" : "text-night"
                      }`}
                    >
                      <span>{catName(root, locale)}</span>
                      {kids.length > 0 ? <span className="text-[10px] text-muted">›</span> : null}
                    </Link>
                  </div>
                </li>
              );
            })}
            <li className="mt-1 border-t border-night/8 px-3 pt-2">
              <Link
                href={`/${locale}/products`}
                onClick={() => {
                  setOpen(false);
                  setHoverRoot(null);
                }}
                className="block rounded-lg px-2 py-2 text-xs font-bold uppercase tracking-wide text-muted hover:bg-teal/10 hover:text-teal"
              >
                {t("home.shopAll")}
              </Link>
            </li>
          </ul>

          {showFlyout ? (
            <ul className="min-w-[13rem] border-s border-night/8 bg-white py-2" role="menu">
              {flyout.map((child) => (
                <li key={child.id} role="none">
                  <Link
                    href={`/${locale}/categories/${child.slug}`}
                    role="menuitem"
                    onClick={() => {
                      setOpen(false);
                      setHoverRoot(null);
                    }}
                    className="block px-4 py-2.5 text-sm font-medium text-night/80 transition hover:bg-teal/8 hover:text-teal"
                  >
                    {catName(child, locale)}
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
