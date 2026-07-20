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

export const PANEL_LOCALES = ["uz", "ru", "en", "ar"] as const;
export type PanelLocale = (typeof PANEL_LOCALES)[number];

const STORAGE_KEY = "gayrat_panel_locale";

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
  return Object.entries(vars).reduce(
    (acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)),
    s
  );
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
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
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
    () => ({
      locale,
      setLocale,
      t,
      dir: (locale === "ar" ? "rtl" : "ltr") as "ltr" | "rtl",
    }),
    [locale, setLocale, t]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useI18n must be used within LocaleProvider");
  return ctx;
}

export function LocaleSwitcher({ variant = "light" }: { variant?: "light" | "dark" }) {
  const { locale, setLocale, t } = useI18n();
  const dark = variant === "dark";
  return (
    <label className="relative block">
      <span className="sr-only">{t("language")}</span>
      <select
        value={locale}
        onChange={(e) => setLocale(e.target.value as PanelLocale)}
        className={`appearance-none rounded-lg border py-2 pe-8 ps-2.5 text-[11px] font-bold uppercase tracking-wide outline-none transition ${
          dark
            ? "border-white/20 bg-white/10 text-white hover:border-white/40"
            : "border-slate-200 bg-white text-slate-700 hover:border-teal/40"
        }`}
        aria-label={t("language")}
      >
        {PANEL_LOCALES.map((loc) => (
          <option key={loc} value={loc} className="text-night">
            {loc}
          </option>
        ))}
      </select>
      <span
        className={`pointer-events-none absolute end-2 top-1/2 -translate-y-1/2 text-[9px] ${
          dark ? "text-white/50" : "text-slate-400"
        }`}
      >
        ▾
      </span>
    </label>
  );
}
