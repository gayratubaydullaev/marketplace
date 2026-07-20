"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, errMsg, getToken, tokenHasAdminRole } from "@/lib/api";
import { Msg, PageHeader, CountPill } from "@/components/ui";
import { LocaleSwitcher, useI18n } from "@/lib/i18n";

export default function AdminHome() {
  const { t, locale } = useI18n();
  const [authed, setAuthed] = useState(false);
  const [email, setEmail] = useState("admin@gayrat.uz");
  const [password, setPassword] = useState("");
  const [loginMsg, setLoginMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<{
    revenue?: number;
    orders?: number;
    customers?: number;
  }>({});
  const [pendingVendors, setPendingVendors] = useState(0);
  const [pendingReviews, setPendingReviews] = useState(0);
  const [dashErr, setDashErr] = useState("");
  const [dashLoading, setDashLoading] = useState(false);

  useEffect(() => {
    setAuthed(tokenHasAdminRole(getToken()));
  }, []);

  useEffect(() => {
    if (!authed) return;
    setDashLoading(true);
    setDashErr("");
    Promise.all([
      api<typeof stats>("/v1/analytics/tenant/overview").catch(() => ({})),
      api<{ items?: { status?: string }[] }>("/v1/admin/vendors").catch(() => ({ items: [] })),
      api<{ items?: unknown[] }>("/v1/admin/reviews?status=pending").catch(() => ({ items: [] })),
    ])
      .then(([s, vendors, reviews]) => {
        setStats(s || {});
        setPendingVendors((vendors.items || []).filter((v) => v.status === "pending").length);
        setPendingReviews((reviews.items || []).length);
      })
      .catch((e) => setDashErr(errMsg(e)))
      .finally(() => setDashLoading(false));
  }, [authed]);

  async function login(e?: React.FormEvent) {
    e?.preventDefault();
    if (!email.trim() || !password) {
      setLoginMsg(t("loginNeedFields"));
      return;
    }
    setLoading(true);
    setLoginMsg("");
    try {
      const data = await api<{ tokens: { access_token: string }; user?: { role?: string } }>("/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: email.trim(), password }),
      });
      localStorage.setItem("access_token", data.tokens.access_token);
      if (!tokenHasAdminRole(data.tokens.access_token)) {
        localStorage.removeItem("access_token");
        setLoginMsg(t("loginNoAccess"));
        return;
      }
      setAuthed(true);
      window.location.assign("/");
    } catch (err) {
      setLoginMsg(errMsg(err));
    } finally {
      setLoading(false);
    }
  }

  const numberLocale = locale === "uz" ? "uz-UZ" : locale === "ru" ? "ru-RU" : locale;

  if (!authed) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-10">
        <div className="grid w-full max-w-4xl overflow-hidden rounded-3xl border border-white/40 bg-white shadow-xl md:grid-cols-2">
          <div className="admin-login-bg hidden flex-col justify-between p-8 text-white md:flex">
            <div>
              <p className="font-display text-3xl font-bold tracking-tight">{t("brand")}</p>
              <p className="mt-2 text-sm text-white/75">{t("consoleSubtitle")}</p>
            </div>
            <div className="space-y-3 text-sm text-white/85">
              <p>{t("loginHint")}</p>
              <p className="text-white/60">{t("loginLocales")}</p>
            </div>
          </div>

          <form className="relative flex flex-col justify-center space-y-5 p-6 sm:p-8" onSubmit={login}>
            <div className="absolute end-6 top-6 sm:end-8 sm:top-8">
              <LocaleSwitcher />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold text-night sm:text-3xl">{t("loginTitle")}</h1>
              <p className="mt-1 text-sm text-slate-500">{t("loginSub")}</p>
            </div>

            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("loginEmail")}</span>
              <input
                type="email"
                autoComplete="username"
                required
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm outline-none ring-teal focus:border-teal focus:bg-white focus:ring-2"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("loginPassword")}</span>
              <input
                type="password"
                autoComplete="current-password"
                required
                placeholder="••••••••"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-sm outline-none ring-teal focus:border-teal focus:bg-white focus:ring-2"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>

            {loginMsg ? (
              <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">
                {loginMsg}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-teal px-4 py-3.5 text-base font-bold text-white shadow-sm transition hover:bg-teal-800 disabled:cursor-wait disabled:opacity-70"
            >
              {loading ? t("dashLoading") : t("loginSubmit")}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title={t("dashTitle")} description={t("dashSub")} />
      {dashLoading && <p className="mb-4 text-sm text-slate-500">{t("dashLoading")}</p>}
      <Msg text={dashErr} />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label={t("dashRevenue")} value={stats.revenue ?? 0} href="/analytics" locale={numberLocale} />
        <Stat label={t("dashOrders")} value={stats.orders ?? 0} href="/orders" locale={numberLocale} />
        <Stat label={t("dashCustomers")} value={stats.customers ?? 0} href="/customers" locale={numberLocale} />
      </div>
      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">{t("dashAttention")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <LinkCard href="/vendors?status=pending" title={t("dashPendingVendors")} value={pendingVendors} openLabel={t("open")} alert />
          <LinkCard href="/reviews" title={t("dashPendingReviews")} value={pendingReviews} openLabel={t("open")} alert />
        </div>
      </div>
      <div className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">{t("dashQuickLinks")}</h2>
        <div className="flex flex-wrap gap-2.5 text-sm">
          <QuickLink href="/products" label={t("navProducts")} />
          <QuickLink href="/orders" label={t("navOrders")} />
          <QuickLink href="/categories" label={t("navCategories")} />
          <QuickLink href="/banners" label={t("navBanners")} />
          <QuickLink href="/vendors" label={t("navVendors")} />
          <QuickLink href="/promotions" label={t("navPromotions")} />
          <QuickLink href="/reviews" label={t("navReviews")} />
          <QuickLink href="/analytics" label={t("navAnalytics")} />
          <QuickLink href="/settings" label={t("navSettings")} />
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  href,
  locale,
}: {
  label: string;
  value: number;
  href: string;
  locale: string;
}) {
  return (
    <Link
      href={href}
      className="block rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 font-display text-3xl font-bold text-teal">{value.toLocaleString(locale)}</p>
    </Link>
  );
}

function LinkCard({
  href,
  title,
  value,
  openLabel,
  alert,
}: {
  href: string;
  title: string;
  value: number;
  openLabel: string;
  alert?: boolean;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div>
        <p className="font-semibold text-night">{title}</p>
        <p className="mt-0.5 text-sm text-slate-500">{openLabel} →</p>
      </div>
      <CountPill value={value} alert={alert} />
    </Link>
  );
}

function QuickLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-slate-200 bg-white px-4 py-2 font-medium text-night shadow-sm transition hover:border-teal hover:text-teal"
    >
      {label}
    </Link>
  );
}
