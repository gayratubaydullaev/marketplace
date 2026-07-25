export const locales = ["uz", "ru", "en", "ar"] as const;
export type Locale = (typeof locales)[number];
/** Locales with routed storefront pages + message packs ready */
export const routingLocales = ["uz", "ru", "en", "ar"] as const;
export type RoutingLocale = (typeof routingLocales)[number];
export const defaultLocale: Locale = "uz";

export const rtlLocales = new Set<Locale>(["ar"]);

export function isRTL(locale: string): boolean {
  return rtlLocales.has(locale as Locale);
}

/** Group digits without Intl — ICU differs between Node and browsers (hydration mismatch). */
function groupThousands(amount: number, separator: string): string {
  const n = Math.round(Number(amount) || 0);
  const sign = n < 0 ? "-" : "";
  const digits = Math.abs(n).toString();
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
}

export function formatUZS(amount: number, locale: Locale | string = "uz"): string {
  // uz/ru/ar: NBSP thousands; en: comma. Never use Intl here.
  if (locale === "uz") return `${groupThousands(amount, "\u00A0")} so'm`;
  if (locale === "ru") return `${groupThousands(amount, "\u00A0")} сум`;
  if (locale === "ar") return `${groupThousands(amount, "\u00A0")} UZS`;
  return `${groupThousands(amount, ",")} UZS`;
}

export function formatMoney(
  amount: number,
  currency = "UZS",
  locale: string = "uz"
): string {
  if (currency === "UZS") return formatUZS(amount, locale);
  // Fixed pattern avoids SSR/CSR Intl drift.
  const n = Number(amount) || 0;
  const fixed = n.toFixed(2);
  const [whole, frac] = fixed.split(".");
  const sep = locale === "en" ? "," : "\u00A0";
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  return `${grouped}.${frac} ${currency}`;
}
