"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { clearTokens, getToken, tokenHasVendorRole } from "@/lib/api";
import { LogoutButton } from "@/components/LogoutButton";
import { LocaleSwitcher, useI18n } from "@/lib/i18n";

type NavItem = { href: string; label: string };
type NavGroup = { key: string; label: string; items: NavItem[] };

function useVendorNavGroups(): NavGroup[] {
  const { t } = useI18n();
  return [
    {
      key: "main",
      label: t("navGroupMain"),
      items: [{ href: "/", label: t("navDashboard") }],
    },
    {
      key: "catalog",
      label: t("navGroupCatalog"),
      items: [
        { href: "/products", label: t("navProducts") },
        { href: "/inventory", label: t("navInventory") },
      ],
    },
    {
      key: "commerce",
      label: t("navGroupCommerce"),
      items: [
        { href: "/orders", label: t("navOrders") },
        { href: "/reviews", label: t("navReviews") },
      ],
    },
    {
      key: "business",
      label: t("navGroupBusiness"),
      items: [
        { href: "/analytics", label: t("navAnalytics") },
        { href: "/payouts", label: t("navPayouts") },
      ],
    },
    {
      key: "system",
      label: t("navGroupSystem"),
      items: [{ href: "/settings", label: t("navSettings") }],
    },
  ];
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const groups = useVendorNavGroups();
  return (
    <nav className="space-y-5 text-sm">
      {groups.map((group) => (
        <div key={group.key}>
          <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
            {group.label}
          </p>
          <div className="space-y-0.5">
            {group.items.map((n) => {
              const active =
                n.href === "/"
                  ? pathname === "/"
                  : pathname === n.href || pathname.startsWith(`${n.href}/`);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  onClick={onNavigate}
                  className={`block rounded-xl px-3 py-2.5 font-medium transition ${
                    active
                      ? "bg-teal text-white shadow-sm"
                      : "text-white/80 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {n.label}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

export function VendorShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useI18n();
  const [authed, setAuthed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setAuthed(tokenHasVendorRole(getToken()));
  }, [pathname]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  if (!authed) {
    return <div className="min-h-screen">{children}</div>;
  }

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-64 shrink-0 flex-col bg-night p-5 text-white md:flex">
        <div className="mb-5">
          <p className="font-display text-xl font-bold tracking-tight">{t("brand")}</p>
          <p className="text-xs text-white/50">{t("consoleSubtitle")}</p>
        </div>
        <div className="mb-5">
          <LocaleSwitcher variant="dark" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pe-1">
          <NavLinks />
        </div>
        <div className="mt-4 border-t border-white/10 pt-4">
          <LogoutButton />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-slate-200/80 bg-white/90 px-4 py-3 backdrop-blur md:hidden">
          <button
            type="button"
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold"
            onClick={() => setMenuOpen(true)}
            aria-label={t("menu")}
          >
            {t("menu")}
          </button>
          <p className="font-display font-bold">{t("brand")}</p>
          <div className="flex items-center gap-2">
            <LocaleSwitcher />
            <button
              type="button"
              className="text-sm font-semibold text-teal"
              onClick={() => {
                clearTokens();
                window.location.assign("/");
              }}
            >
              {t("logout")}
            </button>
          </div>
        </header>

        {menuOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <button
              type="button"
              className="absolute inset-0 bg-black/40"
              aria-label={t("close")}
              onClick={() => setMenuOpen(false)}
            />
            <div className="absolute inset-y-0 start-0 flex w-72 flex-col bg-night p-5 text-white shadow-2xl">
              <div className="mb-4 flex items-center justify-between">
                <p className="font-display text-lg font-bold">{t("brand")}</p>
                <button type="button" className="text-sm text-white/70" onClick={() => setMenuOpen(false)}>
                  ✕
                </button>
              </div>
              <div className="mb-4">
                <LocaleSwitcher variant="dark" />
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <NavLinks onNavigate={() => setMenuOpen(false)} />
              </div>
              <div className="mt-4 border-t border-white/10 pt-4">
                <LogoutButton />
              </div>
            </div>
          </div>
        )}

        <main className="flex-1 overflow-x-auto p-4 sm:p-6 md:p-8">{children}</main>
      </div>
    </div>
  );
}
