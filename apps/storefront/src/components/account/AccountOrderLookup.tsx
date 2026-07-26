"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { fieldClass } from "@/components/account/types";

export function AccountOrderLookup({
  lookupNumber,
  lookupPhone,
  onNumberChange,
  onPhoneChange,
  looking,
  lookupMsg,
  onSubmit,
  defaultOpen = false,
}: {
  lookupNumber: string;
  lookupPhone: string;
  onNumberChange: (v: string) => void;
  onPhoneChange: (v: string) => void;
  looking: boolean;
  lookupMsg: string;
  onSubmit: (e: React.FormEvent) => void;
  defaultOpen?: boolean;
}) {
  const to = useTranslations("orders");
  const t = useTranslations("account");
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="rounded-3xl border border-night/8 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-start sm:px-6"
        aria-expanded={open}
      >
        <div>
          <h2 className="font-display text-base font-bold text-night">{to("lookupTitle")}</h2>
          <p className="mt-0.5 text-sm text-muted">{t("lookupToggleHint")}</p>
        </div>
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-night/5 text-night transition ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
      {open ? (
        <form onSubmit={onSubmit} className="border-t border-night/6 px-5 pb-5 pt-4 sm:px-6">
          <p className="text-sm text-muted">{to("lookupHint")}</p>
          <div className="mt-4 grid gap-3">
            <label className="block text-sm font-medium text-night">
              {to("lookupNumber")}
              <input
                className={fieldClass}
                value={lookupNumber}
                onChange={(e) => onNumberChange(e.target.value)}
                placeholder="GZ-84979085"
                required
              />
            </label>
            <label className="block text-sm font-medium text-night">
              {to("lookupPhone")}
              <input
                className={fieldClass}
                value={lookupPhone}
                onChange={(e) => onPhoneChange(e.target.value)}
                placeholder="+998901234567"
                required
              />
            </label>
            <button
              type="submit"
              disabled={looking}
              className="rounded-xl bg-accent py-3 text-sm font-bold text-night disabled:opacity-50"
            >
              {looking ? to("loading") : to("lookupSubmit")}
            </button>
          </div>
          {lookupMsg ? <p className="mt-3 text-sm text-danger">{lookupMsg}</p> : null}
        </form>
      ) : null}
    </section>
  );
}
