import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { routingLocales } from "@gayrat/i18n";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { CookieBanner } from "@/components/CookieBanner";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { HtmlLang } from "@/components/HtmlLang";

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

  return (
    <NextIntlClientProvider messages={messages}>
      <HtmlLang locale={locale} />
      <div dir={dir} lang={locale} className="min-h-dvh overflow-x-clip">
        <Header locale={locale} />
        <main className="site-container min-w-0 overflow-x-clip pb-[calc(var(--bottom-chrome)+1.25rem)] pt-4 md:pb-20 md:pt-6">
          {children}
        </main>
        <Footer locale={locale} />
        <MobileBottomNav locale={locale} />
        <CookieBanner />
      </div>
    </NextIntlClientProvider>
  );
}
