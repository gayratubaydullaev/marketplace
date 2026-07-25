"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export const PANEL_LOCALES = ["uz", "ru", "en"] as const;
export type PanelLocale = (typeof PANEL_LOCALES)[number];

const STORAGE_KEY = "gayrat_delivery_locale";

type Dict = Record<string, string>;

type I18nCtx = {
  locale: PanelLocale;
  setLocale: (l: PanelLocale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  dir: "ltr" | "rtl";
};

const Ctx = createContext<I18nCtx | null>(null);

function interpolate(s: string, vars?: Record<string, string | number>) {
  if (!vars) return s;
  return Object.entries(vars).reduce((acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)), s);
}

export function LocaleProvider({
  messages,
  children,
}: {
  messages: Record<PanelLocale, Dict>;
  children: ReactNode;
}) {
  const [locale, setLocaleState] = useState<PanelLocale>("ru");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as PanelLocale | null;
    if (saved && PANEL_LOCALES.includes(saved)) setLocaleState(saved);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    document.documentElement.lang = locale;
  }, [locale, ready]);

  const setLocale = useCallback((l: PanelLocale) => {
    setLocaleState(l);
    localStorage.setItem(STORAGE_KEY, l);
  }, []);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const dict = messages[locale] || messages.ru;
      const fallback = messages.ru?.[key] || messages.en?.[key] || key;
      return interpolate(dict[key] || fallback, vars);
    },
    [locale, messages]
  );

  const value = useMemo(
    () => ({ locale, setLocale, t, dir: "ltr" as const }),
    [locale, setLocale, t]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useI18n must be used within LocaleProvider");
  return ctx;
}

export function LocaleSwitcher() {
  const { locale, setLocale, t } = useI18n();
  return (
    <label className="relative block">
      <span className="sr-only">{t("language")}</span>
      <select
        value={locale}
        onChange={(e) => setLocale(e.target.value as PanelLocale)}
        className="appearance-none rounded-lg border border-slate-200 bg-white py-1.5 pe-7 ps-2 text-[11px] font-bold uppercase"
      >
        {PANEL_LOCALES.map((loc) => (
          <option key={loc} value={loc}>
            {loc}
          </option>
        ))}
      </select>
    </label>
  );
}
