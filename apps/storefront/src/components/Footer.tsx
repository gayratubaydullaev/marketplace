import Link from "next/link";
import { getTranslations } from "next-intl/server";

export async function Footer({ locale }: { locale: string }) {
  const t = await getTranslations();
  return (
    <footer className="mt-6 border-t border-night/8 bg-night text-paper pb-[calc(var(--bottom-chrome)+0.75rem)] md:mt-12 md:pb-0">
      <div className="site-container py-5 sm:py-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="max-w-md">
            <p className="font-display text-xl font-bold tracking-tight">{t("brand")}</p>
            <p className="mt-2 text-sm leading-relaxed text-paper/65">{t("tagline")}</p>
            <p className="mt-4 text-xs font-medium tracking-wide text-saffron/90">{t("footer.trust")}</p>
          </div>
          <nav className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:flex sm:flex-wrap sm:gap-6">
            <Link href={`/${locale}/privacy`} className="text-paper/70 transition hover:text-saffron">
              {t("footer.privacy")}
            </Link>
            <Link href={`/${locale}/terms`} className="text-paper/70 transition hover:text-saffron">
              {t("footer.terms")}
            </Link>
            <Link href={`/${locale}/sell`} className="text-paper/70 transition hover:text-saffron">
              {t("nav.sell")}
            </Link>
            <Link href={`/${locale}/wishlist`} className="text-paper/70 transition hover:text-saffron">
              {t("nav.wishlist")}
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
