"use client";

import { clearTokens } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

export function LogoutButton() {
  const { t } = useI18n();
  return (
    <button
      type="button"
      className="mt-6 w-full rounded-xl border border-white/20 px-3 py-2.5 text-left text-sm font-medium text-white/90 hover:bg-white/10"
      onClick={() => {
        clearTokens();
        window.location.assign("/");
      }}
    >
      {t("logout")}
    </button>
  );
}
