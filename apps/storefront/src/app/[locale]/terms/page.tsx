import { getTranslations, setRequestLocale } from "next-intl/server";

export default async function TermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("legal");
  return (
    <article className="mx-auto max-w-3xl animate-rise">
      <div className="rounded-2xl border border-night/8 bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-night/40">{t("updated")}</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-night sm:text-3xl">{t("termsTitle")}</h1>
        <div className="mt-6 space-y-4 text-sm leading-relaxed text-night/75 sm:text-[15px]">
          <p>{t("termsBody")}</p>
        </div>
      </div>
    </article>
  );
}
