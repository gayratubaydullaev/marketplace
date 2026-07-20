"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { routingLocales } from "@gayrat/i18n";
import { useCart } from "@/lib/cart";
import { useWishlist } from "@/lib/wishlist";
import { api } from "@/lib/api";
import { HeaderSearch } from "@/components/HeaderSearch";

export function Header({ locale }: { locale: string }) {
  const t = useTranslations();
  const pathname = usePathname();
  const router = useRouter();
  const items = useCart((s) => s.items);
  const wishCount = useWishlist((s) => s.items.length);
  const syncToServer = useCart((s) => s.syncToServer);
  const [showVendors, setShowVendors] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const count = items.reduce((a, i) => a + i.quantity, 0);

  useEffect(() => {
    api<{ mode?: string }>("/v1/tenant/mode")
      .then(({ mode }) => setShowVendors(mode !== "single_store"))
      .catch(() => setShowVendors(true));
    const syncAuth = () => setLoggedIn(Boolean(localStorage.getItem("access_token")));
    syncAuth();
    if (localStorage.getItem("access_token")) syncToServer().catch(() => undefined);
    window.addEventListener("focus", syncAuth);
    window.addEventListener("storage", syncAuth);
    return () => {
      window.removeEventListener("focus", syncAuth);
      window.removeEventListener("storage", syncAuth);
    };
  }, [syncToServer]);

  function logout() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    router.replace(`/${locale}`);
  }

  function localePath(next: string) {
    const rest = pathname.replace(/^\/(uz|ru|en|ar)/, "") || "";
    const qs = typeof window !== "undefined" ? window.location.search : "";
    return `/${next}${rest}${qs}`;
  }

  function goLocale(next: string) {
    if (next === locale) return;
    router.replace(localePath(next));
  }

  function cycleLocale() {
    const idx = routingLocales.indexOf(locale as (typeof routingLocales)[number]);
    const next = routingLocales[(idx + 1) % routingLocales.length];
    goLocale(next);
  }

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  const secondaryNav = [
    { href: `/${locale}/products`, label: t("nav.catalog") },
    ...(showVendors ? [{ href: `/${locale}/vendors`, label: t("nav.vendors") }] : []),
    { href: `/${locale}/orders`, label: t("nav.orders") },
    ...(showVendors ? [{ href: `/${locale}/sell`, label: t("nav.sell") }] : []),
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-night/8 bg-paper/95 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      {/* Mobile: mark · search · language */}
      <div className="site-container flex min-w-0 items-center gap-2 py-2 md:hidden">
        <Link
          href={`/${locale}`}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal text-paper shadow-sm"
          aria-label={t("brand")}
        >
          <span className="font-display text-lg font-extrabold leading-none">G</span>
        </Link>

        <div className="min-w-0 flex-1">
          <HeaderSearch locale={locale} compact />
        </div>

        <button
          type="button"
          onClick={cycleLocale}
          className="flex h-10 min-w-10 shrink-0 items-center justify-center rounded-xl border border-night/12 bg-white px-2 text-[11px] font-extrabold uppercase tracking-wide text-night transition hover:border-teal/40 hover:text-teal"
          aria-label={t("nav.language")}
          title={t("nav.language")}
        >
          {locale}
        </button>
      </div>

      {/* Desktop / tablet */}
      <div className="site-container hidden items-center gap-4 py-3 md:flex lg:gap-6 lg:py-3.5">
        <Link href={`/${locale}`} className="group flex min-w-0 shrink-0 items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal text-paper shadow-sm">
            <span className="font-display text-lg font-extrabold leading-none">G</span>
          </span>
          <span className="font-display truncate text-xl font-extrabold tracking-tight text-night transition group-hover:text-teal lg:text-[1.35rem]">
            {t("brand")}
          </span>
        </Link>

        <div className="min-w-0 flex-1">
          <HeaderSearch locale={locale} />
        </div>

        <div className="ms-auto flex shrink-0 items-center gap-1">
          <label className="relative hidden xl:block">
            <span className="sr-only">{t("nav.language")}</span>
            <select
              className="appearance-none rounded-lg border border-night/10 bg-white py-2 pe-7 ps-2.5 text-[11px] font-bold uppercase tracking-wide text-night/65 outline-none hover:border-teal/40 focus:border-teal"
              value={locale}
              onChange={(e) => goLocale(e.target.value)}
              aria-label={t("nav.language")}
            >
              {routingLocales.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute end-2 top-1/2 -translate-y-1/2 text-[9px] text-night/35">▾</span>
          </label>

          <button
            type="button"
            onClick={cycleLocale}
            className="flex h-10 min-w-10 items-center justify-center rounded-lg border border-night/10 bg-white px-2 text-[11px] font-extrabold uppercase tracking-wide text-night/65 transition hover:border-teal/40 hover:text-teal xl:hidden"
            aria-label={t("nav.language")}
          >
            {locale}
          </button>

          <Link
            href={`/${locale}/wishlist`}
            className="relative flex h-11 w-11 items-center justify-center rounded-lg text-night/65 transition hover:bg-night/5 hover:text-teal"
            aria-label={t("nav.wishlist")}
            title={t("nav.wishlist")}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <path d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 11c0 5.5-7 10-7 10z" strokeLinejoin="round" />
            </svg>
            {wishCount > 0 && (
              <span className="absolute end-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-saffron px-0.5 text-[9px] font-bold text-night">
                {wishCount > 9 ? "9+" : wishCount}
              </span>
            )}
          </Link>

          <Link
            href={`/${locale}/account`}
            className="flex h-10 items-center gap-2 rounded-lg px-2.5 text-sm font-semibold text-night/70 transition hover:bg-night/5 hover:text-night"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
              <circle cx="12" cy="8" r="3.5" />
              <path d="M5 19c1.5-3.5 4-5 7-5s5.5 1.5 7 5" strokeLinecap="round" />
            </svg>
            <span className="hidden lg:inline">{loggedIn ? t("nav.account") : t("nav.login")}</span>
          </Link>

          {loggedIn ? (
            <button
              type="button"
              onClick={logout}
              className="hidden rounded-lg px-2 py-2 text-xs font-medium text-night/40 transition hover:text-teal lg:inline"
            >
              {t("nav.logout")}
            </button>
          ) : null}

          <Link
            href={`/${locale}/cart`}
            className="relative ms-1 flex h-10 items-center gap-2 rounded-xl bg-accent px-3 text-sm font-bold text-night transition hover:bg-accent-hover sm:px-4"
            aria-label={t("nav.cart")}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M6 7h15l-1.5 9H8L6 7z" strokeLinejoin="round" />
              <path d="M6 7 5 4H2" strokeLinecap="round" />
              <circle cx="9" cy="20" r="1" fill="currentColor" stroke="none" />
              <circle cx="18" cy="20" r="1" fill="currentColor" stroke="none" />
            </svg>
            <span className="hidden sm:inline">{t("nav.cart")}</span>
            {count > 0 && (
              <span className="absolute -end-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-night px-1 text-[10px] font-bold text-paper">
                {count > 9 ? "9+" : count}
              </span>
            )}
          </Link>
        </div>
      </div>

      <div className="hidden border-t border-night/6 lg:block">
        <div className="site-container flex items-center gap-1 py-1">
          <nav className="flex flex-1 items-center gap-0.5">
            {secondaryNav.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-md px-3 py-1.5 text-[13px] font-semibold transition ${
                  isActive(l.href)
                    ? "bg-teal/10 text-teal"
                    : "text-muted hover:bg-night/4 hover:text-night"
                }`}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </header>
  );
}
