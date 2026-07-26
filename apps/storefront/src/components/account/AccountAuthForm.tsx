"use client";

import { useTranslations } from "next-intl";
import { fieldClass } from "@/components/account/types";

export function AccountAuthForm({
  mode,
  onModeChange,
  email,
  password,
  onEmailChange,
  onPasswordChange,
  busy,
  onSubmit,
  msg,
}: {
  mode: "login" | "register";
  onModeChange: (mode: "login" | "register") => void;
  email: string;
  password: string;
  onEmailChange: (v: string) => void;
  onPasswordChange: (v: string) => void;
  busy: boolean;
  onSubmit: (e: React.FormEvent) => void;
  msg: { type: "ok" | "err"; text: string } | null;
}) {
  const t = useTranslations("account");

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-3xl border border-night/8 bg-white/80 p-5 shadow-[0_16px_40px_-28px_rgba(11,31,36,0.45)] backdrop-blur-sm sm:p-7"
    >
      <div className="flex gap-1 rounded-2xl bg-night/5 p-1">
        {(["login", "register"] as const).map((key) => (
          <button
            key={key}
            type="button"
            className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition ${
              mode === key ? "bg-white text-night shadow-sm" : "text-muted hover:text-night"
            }`}
            onClick={() => onModeChange(key)}
          >
            {t(key)}
          </button>
        ))}
      </div>
      <label className="block text-sm font-medium text-night">
        {t("emailPlaceholder")}
        <input
          type="email"
          required
          autoComplete="email"
          className={fieldClass}
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
        />
      </label>
      <label className="block text-sm font-medium text-night">
        {t("passwordPlaceholder")}
        <input
          type="password"
          required
          minLength={8}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          className={fieldClass}
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
        />
      </label>
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-xl bg-accent py-3.5 text-sm font-bold text-night transition hover:bg-accent-hover disabled:opacity-50"
      >
        {busy ? t("working") : mode === "login" ? t("login") : t("register")}
      </button>
      {msg ? (
        <p
          className={`text-center text-sm font-medium ${
            msg.type === "ok" ? "text-teal" : "text-danger"
          }`}
          role="status"
        >
          {msg.text}
        </p>
      ) : null}
    </form>
  );
}
