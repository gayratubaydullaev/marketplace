"use client";

import { useI18n } from "@/lib/i18n";

export default function Loading() {
  const { t } = useI18n();
  return <p className="text-sm text-slate-500">{t("commonLoading")}</p>;
}
