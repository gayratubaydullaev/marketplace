import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { BrandMark } from "@/components/BrandMark";

export async function Footer({ locale }: { locale: string }) {
  const t = await getTranslations();
  return (
    <footer className="mt-6 border-t border-night/8 bg-night text-paper pb-[calc(var(--bottom-chrome)+0.75rem)] md:mt-12 md:pb-0 lg:mt-14 xl:mt-16">
      <div className="site-container py-5 sm:py-8 lg:py-10">
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between lg:gap-10">
          <div className="max-w-md lg:max-w-lg">
            <div className="flex items-center gap-2.5">
              <BrandMark size="sm" />
              <p className="font-display text-xl font-bold tracking-tight lg:text-2xl">{t("brand")}</p>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-paper/65 lg:text-[15px]">{t("tagline")}</p>
            <p className="mt-4 text-xs font-medium tracking-wide text-saffron/90">{t("footer.trust")}</p>
          </div>
          <nav className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:flex sm:flex-wrap sm:gap-6 lg:gap-8">
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
