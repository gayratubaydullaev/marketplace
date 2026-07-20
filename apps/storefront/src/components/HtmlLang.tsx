"use client";

import { useEffect } from "react";

export function HtmlLang({ locale }: { locale: string }) {
  useEffect(() => {
    const dir = locale === "ar" || locale === "he" || locale === "fa" ? "rtl" : "ltr";
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
  }, [locale]);
  return null;
}
