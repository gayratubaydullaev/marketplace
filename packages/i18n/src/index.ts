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

export function formatUZS(amount: number, locale: Locale | string = "uz"): string {
  const loc = locale === "uz" ? "uz-UZ" : locale === "ru" ? "ru-RU" : locale;
  const formatted = new Intl.NumberFormat(loc).format(Math.round(amount));
  if (locale === "uz") return `${formatted} so'm`;
  if (locale === "ru") return `${formatted} сум`;
  return `${formatted} UZS`;
}

export function formatMoney(
  amount: number,
  currency = "UZS",
  locale: string = "uz"
): string {
  if (currency === "UZS") return formatUZS(amount, locale);
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}
