"use client";

import { useI18n } from "@/lib/i18n";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  const { t } = useI18n();
  return (
    <div className="rounded-2xl border border-rose-100 bg-white p-6 shadow-sm">
      <h1 className="font-display text-xl font-bold text-night">{t("commonError")}</h1>
      <p className="mt-2 break-all text-sm text-rose-600">{error.message}</p>
      <button
        type="button"
        className="mt-4 rounded-xl bg-night px-4 py-2 text-sm font-semibold text-white"
        onClick={reset}
      >
        {t("commonRetry")}
      </button>
    </div>
  );
}
