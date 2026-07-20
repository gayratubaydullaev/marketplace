"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

export function FilterSheet({
  children,
  activeCount = 0,
}: {
  children: React.ReactNode;
  activeCount?: number;
}) {
  const t = useTranslations("catalog");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <div className="mb-4 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex min-h-12 w-full items-center justify-between rounded-xl border border-night/10 bg-white px-4 py-3 text-sm font-bold"
          aria-expanded={open}
        >
          <span className="flex items-center gap-2">
            {t("filters")}
            {activeCount > 0 ? (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-bold text-night">
                {activeCount}
              </span>
            ) : null}
          </span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-teal" aria-hidden>
            <path d="M4 6h16M7 12h10M10 18h4" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {open ? (
        <div className="fixed inset-0 z-[60] lg:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-x-0 top-0 bg-night/45"
            style={{ bottom: "var(--bottom-chrome)" }}
            aria-label={t("closeFilters")}
            onClick={() => setOpen(false)}
          />
          <div
            className="absolute inset-x-0 flex max-h-[min(88dvh,calc(100dvh-var(--bottom-chrome)))] animate-rise flex-col rounded-t-3xl bg-paper shadow-2xl"
            style={{ bottom: "var(--bottom-chrome)" }}
          >
            <div className="shrink-0 px-5 pt-3">
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-night/15" />
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-display text-lg font-bold">{t("filters")}</h2>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="min-h-10 rounded-lg px-3 text-sm font-semibold text-muted hover:text-night"
                >
                  {t("closeFilters")}
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 pb-4 [&>ul>li>a]:min-h-11 [&>ul>li>a]:py-3">
              {children}
            </div>
            <div className="shrink-0 border-t border-night/8 bg-paper px-5 pb-3 pt-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="min-h-12 w-full rounded-xl bg-accent py-3.5 text-sm font-bold text-night transition hover:bg-accent-hover"
              >
                {t("applyFilters")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <aside className="mb-6 hidden space-y-5 lg:mb-0 lg:block lg:sticky lg:top-24 lg:self-start">
        <h2 className="text-sm font-bold uppercase tracking-wide text-muted">{t("filters")}</h2>
        {children}
      </aside>
    </>
  );
}
