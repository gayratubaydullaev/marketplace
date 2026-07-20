"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { FormEvent, Suspense, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";

function HeaderSearchInner({ locale, compact }: { locale: string; compact?: boolean }) {
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialQ = pathname.includes("/search") ? searchParams.get("q") || "" : "";
  const [q, setQ] = useState(initialQ);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (pathname.includes("/search")) setQ(searchParams.get("q") || "");
  }, [pathname, searchParams]);

  useEffect(() => {
    const needle = q.trim();
    if (needle.length < 2) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(() => {
      api<{ suggestions?: string[]; items?: string[] }>(
        `/v1/search/suggest?q=${encodeURIComponent(needle)}&locale=${locale}`
      )
        .then((d) => setSuggestions((d.suggestions || d.items || []).slice(0, 6)))
        .catch(() => setSuggestions([]));
    }, 220);
    return () => clearTimeout(timer);
  }, [q, locale]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function go(query: string) {
    const value = query.trim();
    if (!value) return;
    setOpen(false);
    router.push(`/${locale}/search?q=${encodeURIComponent(value)}`);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    go(q);
  }

  return (
    <div ref={wrapRef} className={`relative min-w-0 ${compact ? "w-full max-w-full" : "flex-1"}`}>
      <form onSubmit={onSubmit} className="flex w-full min-w-0 max-w-full overflow-hidden rounded-xl border border-night/12 bg-white shadow-sm transition focus-within:border-teal focus-within:ring-2 focus-within:ring-teal/20">
        <label className="sr-only" htmlFor={compact ? "header-search-m" : "header-search"}>
          {t("nav.search")}
        </label>
        <input
          id={compact ? "header-search-m" : "header-search"}
          type="search"
          autoComplete="off"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={t("common.searchPlaceholder")}
          className={`min-w-0 flex-1 border-0 bg-transparent text-sm text-night outline-none placeholder:text-night/40 ${
            compact ? "px-2.5 py-2 text-[13px]" : "px-3.5 py-2.5 sm:px-4"
          }`}
        />
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

      {open && suggestions.length > 0 ? (
        <ul className="absolute inset-x-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-xl border border-night/10 bg-white py-1 shadow-lg">
          {suggestions.map((s) => (
            <li key={s}>
              <button
                type="button"
                className="flex w-full items-center gap-2 px-4 py-2.5 text-start text-sm text-night hover:bg-teal/8 hover:text-teal"
                onClick={() => {
                  setQ(s);
                  go(s);
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-night/35" aria-hidden>
                  <circle cx="11" cy="11" r="7" />
                  <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
                </svg>
                {s}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
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
