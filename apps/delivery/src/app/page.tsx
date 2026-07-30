"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@gayrat/ui";
import { api, clearTokens, errMsg, ensureCourierSession, isCourierRole } from "@/lib/api";
import { LocaleSwitcher, useI18n } from "@/lib/i18n";

const EMAIL_KEY = "gayrat_courier_email";

export default function LoginPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [email, setEmail] = useState("courier@gayrat.uz");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void ensureCourierSession().then((ok) => {
      if (ok) router.replace("/jobs");
    });
    const saved = localStorage.getItem(EMAIL_KEY);
    if (saved) setEmail(saved);
  }, [router]);

  async function login(e?: React.FormEvent) {
    e?.preventDefault();
    if (!email.trim() || !password) {
      setMsg(t("loginNeedFields"));
      return;
    }
    setLoading(true);
    setMsg("");
    try {
      const data = await api<{ user?: { role?: string } }>("/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), password }),
      });
      localStorage.setItem(EMAIL_KEY, email.trim());
      if (!isCourierRole(data.user?.role)) {
        await clearTokens();
        setMsg(t("loginNoAccess"));
        return;
      }
      router.replace("/jobs");
    } catch (err) {
      setMsg(errMsg(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="courier-login-bg flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-xl">
        <div className="bg-gradient-to-r from-night to-teal px-6 py-5 text-white sm:px-8">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-display text-3xl font-bold">{t("brand")}</p>
              <p className="mt-1 text-sm text-white/80">{t("loginSub")}</p>
            </div>
            <div className="rounded-lg bg-white/10 p-1">
              <LocaleSwitcher />
            </div>
          </div>
        </div>
        <div className="p-6 sm:p-8">
          <h1 className="text-lg font-semibold text-night">{t("loginTitle")}</h1>
          <p className="mt-1 text-xs text-slate-500">{t("loginHint")}</p>
          <form className="mt-4 space-y-3" onSubmit={login}>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-500">{t("loginEmail")}</span>
              <input
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-teal"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                inputMode="email"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-slate-500">{t("loginPassword")}</span>
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 pe-16 outline-none focus:border-teal"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 end-0 px-3 text-xs font-semibold text-teal"
                  onClick={() => setShowPass((v) => !v)}
                >
                  {showPass ? t("loginHidePass") : t("loginShowPass")}
                </button>
              </div>
            </label>
            {msg ? <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{msg}</p> : null}
            <Button type="submit" variant="primary" className="w-full !py-3" disabled={loading}>
              {loading ? t("authLoading") : t("loginSubmit")}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
