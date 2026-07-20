import Link from "next/link";
import { getTranslations } from "next-intl/server";

export default async function NotFound() {
  const t = await getTranslations();
  return (
    <div className="py-16 text-center animate-rise">
      <h1 className="font-display text-3xl font-bold">{t("errors.notFound")}</h1>
      <p className="mt-3 text-sm text-night/60">404</p>
      <Link
        href="/"
        className="mt-8 inline-block rounded-full bg-teal px-6 py-3 text-sm font-bold text-paper"
      >
        {t("common.goHome")}
      </Link>
    </div>
  );
}
