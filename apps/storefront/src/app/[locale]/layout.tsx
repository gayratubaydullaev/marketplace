import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routingLocales } from "@gayrat/i18n";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { CookieBanner } from "@/components/CookieBanner";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { CartHydrator } from "@/components/CartHydrator";
import { HtmlLang } from "@/components/HtmlLang";
import { api } from "@/lib/api";
import type { CatalogCat } from "@/components/CatalogSheet";

export function generateStaticParams() {
  return routingLocales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!(routingLocales as readonly string[]).includes(locale)) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();
  const dir = locale === "ar" || locale === "he" || locale === "fa" ? "rtl" : "ltr";

  let categories: CatalogCat[] = [];
  try {
    const data = await api<{ items: CatalogCat[] }>("/v1/categories");
    categories = data.items || [];
  } catch {
    categories = [];
  }

  return (
    <NextIntlClientProvider messages={messages}>
      <HtmlLang locale={locale} />
      <div dir={dir} lang={locale} className="min-h-dvh">
        <Header locale={locale} />
        <main className="site-container min-w-0 overflow-x-clip pb-3 pt-1 md:pb-12 md:pt-3">
          {children}
        </main>
        <Footer locale={locale} />
        <MobileBottomNav locale={locale} categories={categories} />
        <CookieBanner />
        <CartHydrator />
      </div>
    </NextIntlClientProvider>
  );
}
