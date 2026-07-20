"use client";

import { useTranslations } from "next-intl";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors");
  return (
    <div className="py-16 text-center">
      <h1 className="font-display text-2xl font-bold">{t("somethingWrong")}</h1>
      <p className="mt-3 text-sm text-night/60">{error.message || t("generic")}</p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 rounded-full bg-teal px-5 py-2 text-sm font-bold text-paper"
      >
        {t("tryAgain")}
      </button>
    </div>
  );
}
