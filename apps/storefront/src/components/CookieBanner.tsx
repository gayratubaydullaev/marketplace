"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

export function CookieBanner() {
  const t = useTranslations("footer");
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const hasStickyAction =
    /\/products\/[^/]+$/.test(pathname) ||
    pathname.includes("/cart") ||
    pathname.includes("/checkout");

  useEffect(() => {
    setVisible(!localStorage.getItem("cookie_consent"));
  }, []);

  function consent(value: "accepted" | "rejected") {
    localStorage.setItem("cookie_consent", value);
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      className={`fixed inset-x-3 z-[45] mx-auto flex max-w-3xl flex-col gap-3 rounded-2xl bg-night p-4 text-sm text-paper shadow-xl sm:inset-x-4 sm:flex-row sm:items-center sm:justify-between ${
        hasStickyAction ? "bottom-[calc(var(--bottom-with-action)+0.75rem)] md:bottom-4" : "bottom-[calc(var(--bottom-chrome)+0.75rem)] md:bottom-4"
      }`}
    >
      <p className="text-paper/90">{t("cookies")}</p>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          onClick={() => consent("rejected")}
          className="min-h-11 flex-1 rounded-full border border-paper/30 px-3 py-2 sm:flex-none"
        >
          {t("cookiesEssential")}
        </button>
        <button
          type="button"
          onClick={() => consent("accepted")}
          className="min-h-11 flex-1 rounded-full bg-saffron px-3 py-2 font-bold text-night sm:flex-none"
        >
          {t("cookiesAccept")}
        </button>
      </div>
    </div>
  );
}
