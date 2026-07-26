"use client";

import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { FormEvent, Suspense, useEffect, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { formatUZS, type Locale } from "@gayrat/i18n";
import { api, productName, type Product } from "@/lib/api";
import { rewriteMediaUrl } from "@/lib/media";
import {
  clearRecentSearches,
  loadRecentSearches,
  parseSuggestions,
  pushRecentSearch,
} from "@/lib/search";

function HeaderSearchInner({ locale, compact }: { locale: string; compact?: boolean }) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const listId = useId();
  const initialQ = pathname.includes("/search") ? searchParams.get("q") || "" : "";
  const [q, setQ] = useState(initialQ);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [popular, setPopular] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (pathname.includes("/search")) setQ(searchParams.get("q") || "");
  }, [pathname, searchParams]);

  useEffect(() => {
    setRecent(loadRecentSearches());
    api<{ items?: { query: string }[] }>("/v1/search/popular")
      .then((d) => setPopular((d.items || []).map((x) => x.query).filter(Boolean).slice(0, 6)))
      .catch(() => setPopular([]));
  }, []);

  useEffect(() => {
    const needle = q.trim();
    if (needle.length < 2) {
      setSuggestions([]);
      setProducts([]);
      setActive(-1);
      return;
    }
    const timer = setTimeout(() => {
      api<{ suggestions?: string[]; items?: string[]; products?: Product[] }>(
        `/v1/search/suggest?q=${encodeURIComponent(needle)}&locale=${locale}`
      )
        .then((d) => {
          setSuggestions(parseSuggestions(d).slice(0, 6));
          setProducts((d.products || []).slice(0, 4));
          setActive(-1);
        })
        .catch(() => {
          setSuggestions([]);
          setProducts([]);
        });
    }, 200);
    return () => clearTimeout(timer);
  }, [q, locale]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const showRecent = open && q.trim().length < 2 && recent.length > 0;
  const showPopular = open && q.trim().length < 2 && popular.length > 0;
  const showSuggest = open && q.trim().length >= 2 && (suggestions.length > 0 || products.length > 0);
  const panelOpen = showRecent || showPopular || showSuggest;

  const flatActions: { type: "query" | "product"; value: string; product?: Product }[] = [];
  if (showSuggest) {
    for (const s of suggestions) flatActions.push({ type: "query", value: s });
    for (const p of products) flatActions.push({ type: "product", value: p.slug, product: p });
  } else if (showRecent) {
    for (const s of recent) flatActions.push({ type: "query", value: s });
  } else if (showPopular) {
    for (const s of popular) flatActions.push({ type: "query", value: s });
  }

  function go(query: string) {
    const value = query.trim();
    if (!value) return;
    pushRecentSearch(value);
    setRecent(loadRecentSearches());
    setOpen(false);
    setActive(-1);
    router.push(`/${locale}/search?q=${encodeURIComponent(value)}`);
  }

  function goProduct(slug: string) {
    setOpen(false);
    setActive(-1);
    router.push(`/${locale}/products/${slug}`);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (active >= 0 && flatActions[active]) {
      const a = flatActions[active];
      if (a.type === "product") goProduct(a.value);
      else go(a.value);
      return;
    }
    go(q);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!panelOpen || flatActions.length === 0) {
      if (e.key === "Escape") setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % flatActions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i <= 0 ? flatActions.length - 1 : i - 1));
    } else if (e.key === "Escape") {
      setOpen(false);
      setActive(-1);
    }
  }

  return (
    <div ref={wrapRef} className={`relative min-w-0 ${compact ? "w-full max-w-full" : "flex-1"}`}>
      <form
        onSubmit={onSubmit}
        role="search"
        className="flex w-full min-w-0 max-w-full overflow-hidden rounded-xl border border-night/12 bg-white shadow-sm transition focus-within:border-teal focus-within:ring-2 focus-within:ring-teal/20"
      >
        <label className="sr-only" htmlFor={compact ? "header-search-m" : "header-search"}>
          {t("nav.search")}
        </label>
        <input
          ref={inputRef}
          id={compact ? "header-search-m" : "header-search"}
          type="search"
          autoComplete="off"
          enterKeyHint="search"
          role="combobox"
          aria-expanded={panelOpen}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-opt-${active}` : undefined}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={t("common.searchPlaceholder")}
          className={`min-w-0 flex-1 border-0 bg-transparent text-sm text-night outline-none placeholder:text-night/40 ${
            compact ? "px-2.5 py-2 text-[13px]" : "px-3.5 py-2.5 sm:px-4"
          }`}
        />
        {q ? (
          <button
            type="button"
            className="shrink-0 px-2 text-night/40 hover:text-night"
            aria-label={t("search.clear")}
            onClick={() => {
              setQ("");
              setSuggestions([]);
              setProducts([]);
              inputRef.current?.focus();
            }}
          >
            ✕
          </button>
        ) : null}
        <button
          type="submit"
          className={`flex shrink-0 items-center justify-center bg-teal text-sm font-bold text-paper transition hover:bg-teal-800 ${
            compact ? "px-2.5" : "gap-2 px-4 sm:px-5"
          }`}
          aria-label={t("nav.search")}
        >
          <svg width={compact ? 16 : 18} height={compact ? 16 : 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
          </svg>
          {!compact ? <span className="hidden sm:inline">{t("nav.search")}</span> : null}
        </button>
      </form>

      {panelOpen ? (
        <div
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-[calc(100%+6px)] z-50 max-h-[min(70dvh,420px)] overflow-y-auto rounded-xl border border-night/10 bg-white py-1 shadow-lg"
        >
          {showRecent ? (
            <div className="px-2 py-1">
              <div className="flex items-center justify-between px-2 py-1.5">
                <p className="text-[11px] font-bold uppercase tracking-wide text-muted">{t("search.recent")}</p>
                <button
                  type="button"
                  className="text-[11px] font-semibold text-teal hover:underline"
                  onClick={() => {
                    clearRecentSearches();
                    setRecent([]);
                  }}
                >
                  {t("search.clearRecent")}
                </button>
              </div>
              <ul>
                {recent.map((s, i) => (
                  <li key={`r-${s}`}>
                    <button
                      type="button"
                      id={`${listId}-opt-${i}`}
                      role="option"
                      aria-selected={active === i}
                      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-start text-sm ${
                        active === i ? "bg-teal/10 text-teal" : "text-night hover:bg-teal/8 hover:text-teal"
                      }`}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => go(s)}
                    >
                      <HistoryIcon />
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {showPopular && !showRecent ? (
            <div className="px-2 py-1">
              <p className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">
                {t("search.popular")}
              </p>
              <ul>
                {popular.map((s, i) => (
                  <li key={`p-${s}`}>
                    <button
                      type="button"
                      id={`${listId}-opt-${i}`}
                      role="option"
                      aria-selected={active === i}
                      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-start text-sm ${
                        active === i ? "bg-teal/10 text-teal" : "text-night hover:bg-teal/8 hover:text-teal"
                      }`}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => go(s)}
                    >
                      <SearchIcon />
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {showSuggest ? (
            <>
              {suggestions.length > 0 ? (
                <ul className="px-1 py-1">
                  {suggestions.map((s, i) => (
                    <li key={`s-${s}`}>
                      <button
                        type="button"
                        id={`${listId}-opt-${i}`}
                        role="option"
                        aria-selected={active === i}
                        className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-start text-sm ${
                          active === i ? "bg-teal/10 text-teal" : "text-night hover:bg-teal/8 hover:text-teal"
                        }`}
                        onMouseEnter={() => setActive(i)}
                        onClick={() => go(s)}
                      >
                        <SearchIcon />
                        <span className="min-w-0 truncate">{s}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {products.length > 0 ? (
                <div className="border-t border-night/8 px-1 py-1">
                  <p className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-muted">
                    {t("search.products")}
                  </p>
                  <ul>
                    {products.map((p, i) => {
                      const idx = suggestions.length + i;
                      const name = productName(p, locale);
                      const img = Array.isArray(p.images) && typeof p.images[0] === "string"
                        ? rewriteMediaUrl(p.images[0])
                        : "";
                      return (
                        <li key={p.id || p.slug}>
                          <button
                            type="button"
                            id={`${listId}-opt-${idx}`}
                            role="option"
                            aria-selected={active === idx}
                            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-start ${
                              active === idx ? "bg-teal/10" : "hover:bg-teal/8"
                            }`}
                            onMouseEnter={() => setActive(idx)}
                            onClick={() => {
                              pushRecentSearch(name);
                              goProduct(p.slug);
                            }}
                          >
                            <span className="flex h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-surface-muted">
                              {img ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={img} alt="" className="h-full w-full object-cover" />
                              ) : null}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-night">{name}</span>
                              <span className="mt-0.5 block text-xs font-bold text-teal">
                                {formatUZS(Number(p.price) || 0, locale as Locale)}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
              <div className="border-t border-night/8 px-2 py-1">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-start text-sm font-semibold text-teal hover:bg-teal/8"
                  onClick={() => go(q)}
                >
                  <SearchIcon />
                  {t("search.seeAll", { query: q.trim() })}
                </button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-night/35" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-night/35" aria-hidden>
      <path d="M3 12a9 9 0 1 0 3-6.7" strokeLinecap="round" />
      <path d="M3 4v5h5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 7v5l3 2" strokeLinecap="round" />
    </svg>
  );
}

export function HeaderSearch({ locale, compact }: { locale: string; compact?: boolean }) {
  return (
    <Suspense
      fallback={
        <div
          className={`h-[42px] rounded-xl border border-night/12 bg-white ${compact ? "w-full" : "min-w-0 flex-1"}`}
        />
      }
    >
      <HeaderSearchInner locale={locale} compact={compact} />
    </Suspense>
  );
}

/** Inline search used on the empty /search page (mobile-friendly). */
export function SearchLanding({ locale }: { locale: string }) {
  const t = useTranslations();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const [popular, setPopular] = useState<string[]>([]);
  const [categories, setCategories] = useState<
    { slug: string; parent_id?: string | null; translations?: Record<string, { name?: string }> }[]
  >([]);

  useEffect(() => {
    setRecent(loadRecentSearches());
    Promise.all([
      api<{ items?: { query: string }[] }>("/v1/search/popular").catch(() => ({ items: [] })),
      api<{ items: typeof categories }>("/v1/categories").catch(() => ({ items: [] })),
    ]).then(([pop, cats]) => {
      setPopular((pop.items || []).map((x) => x.query).filter(Boolean).slice(0, 8));
      setCategories((cats.items || []).filter((c) => c.slug && !c.parent_id).slice(0, 8));
    });
  }, []);

  function go(query: string) {
    const value = query.trim();
    if (!value) return;
    pushRecentSearch(value);
    router.push(`/${locale}/search?q=${encodeURIComponent(value)}`);
  }

  return (
    <div className="mx-auto max-w-lg animate-rise px-1 py-6 sm:py-10">
      <h1 className="font-display text-2xl font-bold tracking-tight text-night sm:text-3xl">
        {t("search.title")}
      </h1>
      <p className="mt-2 text-sm text-muted">{t("search.hint")}</p>

      <form
        className="mt-5 flex overflow-hidden rounded-xl border border-night/12 bg-white shadow-sm focus-within:border-teal focus-within:ring-2 focus-within:ring-teal/20"
        onSubmit={(e) => {
          e.preventDefault();
          go(q);
        }}
      >
        <input
          type="search"
          autoFocus
          enterKeyHint="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("common.searchPlaceholder")}
          className="min-w-0 flex-1 border-0 bg-transparent px-4 py-3 text-sm outline-none placeholder:text-night/40"
        />
        <button type="submit" className="bg-teal px-4 text-sm font-bold text-paper hover:bg-teal-800">
          {t("nav.search")}
        </button>
      </form>

      {recent.length > 0 ? (
        <section className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{t("search.recent")}</h2>
            <button
              type="button"
              className="text-xs font-semibold text-teal"
              onClick={() => {
                clearRecentSearches();
                setRecent([]);
              }}
            >
              {t("search.clearRecent")}
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {recent.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => go(s)}
                className="rounded-full border border-night/10 bg-white px-3.5 py-1.5 text-sm font-medium text-night hover:border-teal/40 hover:text-teal"
              >
                {s}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {popular.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{t("search.popular")}</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {popular.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => go(s)}
                className="rounded-full border border-night/10 bg-white px-3.5 py-1.5 text-sm font-medium text-night hover:border-teal/40 hover:text-teal"
              >
                {s}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {categories.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{t("nav.categories")}</h2>
          <ul className="mt-3 grid grid-cols-2 gap-2">
            {categories.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/${locale}/categories/${c.slug}`}
                  className="block rounded-xl border border-night/8 bg-white px-3 py-3 text-sm font-semibold text-night transition hover:border-teal/35 hover:text-teal"
                >
                  {c.translations?.[locale]?.name || c.translations?.uz?.name || c.slug}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
