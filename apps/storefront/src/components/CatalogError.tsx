"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ErrorPanel } from "@/components/PageChrome";

export function CatalogError() {
  const router = useRouter();
  const t = useTranslations();

  return (
    <ErrorPanel
      title={t("common.error")}
      description={t("search.tryDifferent")}
      onRetry={() => router.refresh()}
      retryLabel={t("common.retry")}
    />
  );
}
