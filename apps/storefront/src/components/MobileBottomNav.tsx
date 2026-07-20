"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCart } from "@/lib/cart";

export function MobileBottomNav({ locale }: { locale: string }) {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const count = useCart((s) => s.items.reduce((a, i) => a + i.quantity, 0));

  const tabs = [
    { href: `/${locale}`, label: t("home"), match: (p: string) => p === `/${locale}` || p === `/${locale}/`, icon: HomeIcon },
    { href: `/${locale}/products`, label: t("catalog"), match: (p: string) => p.includes("/products") || p.includes("/categories"), icon: GridIcon },
    { href: `/${locale}/search`, label: t("search"), match: (p: string) => p.includes("/search"), icon: SearchIcon },
    { href: `/${locale}/cart`, label: t("cart"), match: (p: string) => p.includes("/cart") || p.includes("/checkout"), icon: CartIcon, badge: count },
    { href: `/${locale}/account`, label: t("account"), match: (p: string) => p.includes("/account") || p.includes("/orders"), icon: UserIcon },
  ];

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-[70] border-t border-teal/15 bg-paper/95 backdrop-blur-md md:hidden"
      style={{ paddingBottom: "max(0.35rem, env(safe-area-inset-bottom))" }}
      aria-label="Mobile"
    >
      <ul className="mx-auto grid h-[var(--bottom-nav-h)] max-w-lg grid-cols-5 gap-0 px-1">
        {tabs.map((tab) => {
          const active = tab.match(pathname);
          const Icon = tab.icon;
          return (
            <li key={tab.href} className="flex">
              <Link
                href={tab.href}
                className={`relative flex min-h-0 w-full flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-[10px] font-semibold ${
                  active ? "text-teal" : "text-night/45"
                }`}
              >
                <span className="relative">
                  <Icon active={active} />
                  {tab.badge ? (
                    <span className="absolute -end-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-saffron px-0.5 text-[9px] font-bold text-night">
                      {tab.badge > 9 ? "9+" : tab.badge}
                    </span>
                  ) : null}
                </span>
                <span className="max-w-full truncate">{tab.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.7} aria-hidden>
      <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5z" strokeLinejoin="round" />
    </svg>
  );
}

function GridIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.7} aria-hidden>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function SearchIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.7} aria-hidden>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16.5 16.5 20 20" strokeLinecap="round" />
    </svg>
  );
}

function CartIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.7} aria-hidden>
      <path d="M6 7h15l-1.5 9H8L6 7z" strokeLinejoin="round" />
      <path d="M6 7 5 4H2" strokeLinecap="round" />
      <circle cx="9" cy="20" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="17" cy="20" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function UserIcon({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.7} aria-hidden>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 19.5c1.5-3.5 4-5 7-5s5.5 1.5 7 5" strokeLinecap="round" />
    </svg>
  );
}
