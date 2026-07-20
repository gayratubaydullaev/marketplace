"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { formatUZS, type Locale } from "@gayrat/i18n";
import { api } from "@/lib/api";
import { UZ_REGIONS } from "@/lib/regions";
import { useWishlist } from "@/lib/wishlist";
import { useCart } from "@/lib/cart";
import { EmptyState, PageHeader, StatusBadge } from "@/components/PageChrome";

type Tab = "profile" | "addresses" | "orders";

type User = {
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  locale?: string;
};

type Address = {
  id: string;
  label?: string | null;
  full_name?: string | null;
  phone?: string | null;
  region?: string;
  district?: string | null;
  street?: string | null;
  building?: string | null;
  apartment?: string | null;
  is_default?: boolean;
};

type Order = {
  id: string;
  order_number: string;
  status: string;
  total: number;
  created_at?: string;
};

type AddressForm = {
  label: string;
  full_name: string;
  phone: string;
  region: string;
  district: string;
  street: string;
  building: string;
  apartment: string;
  is_default: boolean;
};

const emptyAddressForm = (): AddressForm => ({
  label: "",
  full_name: "",
  phone: "+998",
  region: UZ_REGIONS[0],
  district: "",
  street: "",
  building: "",
  apartment: "",
  is_default: false,
});

const fieldClass =
  "mt-1.5 w-full rounded-xl border border-night/10 bg-surface-muted px-3.5 py-2.5 text-sm outline-none transition focus:border-accent/40 focus:bg-white";

function initials(user: User) {
  const a = (user.first_name || "").trim();
  const b = (user.last_name || "").trim();
  if (a || b) return `${a.slice(0, 1)}${b.slice(0, 1)}`.toUpperCase() || "?";
  return user.email.slice(0, 1).toUpperCase();
}

function displayName(user: User) {
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  return name || user.email;
}

function orderStatusLabel(t: ReturnType<typeof useTranslations>, status: string) {
  const key = `status${status.charAt(0).toUpperCase()}${status.slice(1)}` as
    | "statusPending"
    | "statusConfirmed"
    | "statusProcessing"
    | "statusShipped"
    | "statusDelivered"
    | "statusCompleted"
    | "statusCancelled";
  try {
    return t(key);
  } catch {
    return status;
  }
}

export default function AccountPage() {
  const t = useTranslations("account");
  const to = useTranslations("orders");
  const tn = useTranslations("nav");
  const locale = useLocale();
  const wishlistCount = useWishlist((s) => s.items.length);
  const cartCount = useCart((s) => s.items.reduce((n, i) => n + i.quantity, 0));

  const [bootstrapping, setBootstrapping] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [tab, setTab] = useState<Tab>("profile");
  const [profile, setProfile] = useState({ first_name: "", last_name: "", phone: "" });
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [addressForm, setAddressForm] = useState<AddressForm>(emptyAddressForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);

  const flash = useCallback((type: "ok" | "err", text: string) => {
    setMsg({ type, text });
    window.setTimeout(() => setMsg(null), 3200);
  }, []);

  const loadAddresses = useCallback(async () => {
    const data = await api<{ items?: Address[]; addresses?: Address[] }>("/v1/addresses");
    setAddresses(data.items || data.addresses || []);
  }, []);

  const loadOrders = useCallback(async () => {
    const data = await api<{ items: Order[] }>("/v1/orders");
    setOrders(data.items || []);
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      setBootstrapping(false);
      return;
    }
    Promise.all([
      api<User>("/v1/auth/me").then((u) => {
        setUser(u);
        setProfile({
          first_name: u.first_name || "",
          last_name: u.last_name || "",
          phone: u.phone || "",
        });
      }),
      loadAddresses().catch(() => undefined),
      loadOrders().catch(() => undefined),
    ])
      .catch(() => undefined)
      .finally(() => setBootstrapping(false));
  }, [loadAddresses, loadOrders]);

  async function submitAuth(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const path = mode === "login" ? "/v1/auth/login" : "/v1/auth/register";
      const data = await api<{
        user: User;
        tokens: { access_token: string; refresh_token: string };
      }>(path, { method: "POST", body: JSON.stringify({ email, password, locale }) });
      localStorage.setItem("access_token", data.tokens.access_token);
      localStorage.setItem("refresh_token", data.tokens.refresh_token);
      setUser(data.user);
      setProfile({
        first_name: data.user.first_name || "",
        last_name: data.user.last_name || "",
        phone: data.user.phone || "",
      });
      await Promise.all([loadAddresses(), loadOrders()]);
      flash("ok", mode === "login" ? t("loginSuccess") : t("registerSuccess"));
    } catch (err) {
      flash("err", err instanceof Error ? err.message : t("authError"));
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const u = await api<User>("/v1/auth/me", {
        method: "PUT",
        body: JSON.stringify(profile),
      });
      setUser(u);
      setEditingProfile(false);
      flash("ok", t("saved"));
    } catch (err) {
      flash("err", err instanceof Error ? err.message : t("saveError"));
    } finally {
      setBusy(false);
    }
  }

  function startEditProfile() {
    setProfile({
      first_name: user?.first_name || "",
      last_name: user?.last_name || "",
      phone: user?.phone || "",
    });
    setEditingProfile(true);
  }

  function cancelEditProfile() {
    setProfile({
      first_name: user?.first_name || "",
      last_name: user?.last_name || "",
      phone: user?.phone || "",
    });
    setEditingProfile(false);
  }

  function startCreateAddress() {
    setEditingId(null);
    setAddressForm({
      ...emptyAddressForm(),
      full_name: [profile.first_name, profile.last_name].filter(Boolean).join(" "),
      phone: profile.phone || "+998",
      is_default: addresses.length === 0,
    });
    setShowAddressForm(true);
  }

  function startEditAddress(item: Address) {
    setEditingId(item.id);
    setAddressForm({
      label: item.label || "",
      full_name: item.full_name || "",
      phone: item.phone || "+998",
      region: item.region || UZ_REGIONS[0],
      district: item.district || "",
      street: item.street || "",
      building: item.building || "",
      apartment: item.apartment || "",
      is_default: Boolean(item.is_default),
    });
    setShowAddressForm(true);
  }

  async function saveAddress(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const body = {
      label: addressForm.label || null,
      full_name: addressForm.full_name,
      phone: addressForm.phone,
      region: addressForm.region,
      district: addressForm.district || null,
      street: addressForm.street,
      building: addressForm.building || null,
      apartment: addressForm.apartment || null,
      is_default: addressForm.is_default,
    };
    try {
      if (editingId) {
        await api(`/v1/addresses/${editingId}`, {
          method: "PUT",
          body: JSON.stringify(body),
        });
      } else {
        await api("/v1/addresses", {
          method: "POST",
          body: JSON.stringify(body),
        });
      }
      setShowAddressForm(false);
      setEditingId(null);
      setAddressForm(emptyAddressForm());
      await loadAddresses();
      flash("ok", t("saved"));
    } catch (err) {
      flash("err", err instanceof Error ? err.message : t("saveError"));
    } finally {
      setBusy(false);
    }
  }

  async function deleteAddress(id: string) {
    if (!window.confirm(t("deleteAddressConfirm"))) return;
    try {
      await api(`/v1/addresses/${id}`, { method: "DELETE" });
      await loadAddresses();
      if (editingId === id) {
        setShowAddressForm(false);
        setEditingId(null);
      }
    } catch {
      flash("err", t("saveError"));
    }
  }

  function logout() {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    window.location.assign(`/${locale}`);
  }

  const recentOrders = useMemo(() => orders.slice(0, 5), [orders]);

  const tabs: { id: Tab; label: string }[] = [
    { id: "profile", label: t("profile") },
    { id: "addresses", label: t("addresses") },
    { id: "orders", label: t("ordersTab") },
  ];

  if (bootstrapping) {
    return (
      <div className="mx-auto max-w-3xl animate-rise pb-[calc(var(--bottom-nav-h,0px)+1.5rem)] md:pb-0">
        <div className="h-9 w-40 animate-pulse rounded-lg bg-night/8" />
        <div className="mt-6 h-28 animate-pulse rounded-3xl bg-night/5" />
        <div className="mt-4 grid grid-cols-3 gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-night/5" />
          ))}
        </div>
        <div className="mt-6 h-64 animate-pulse rounded-3xl bg-night/5" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-md animate-rise pb-[calc(var(--bottom-nav-h,0px)+1.5rem)] md:pb-0">
        <PageHeader title={t("title")} subtitle={t("authSubtitle")} />
        <form
          onSubmit={submitAuth}
          className="mt-8 space-y-4 rounded-3xl border border-night/8 bg-white/80 p-5 shadow-[0_16px_40px_-28px_rgba(11,31,36,0.45)] backdrop-blur-sm sm:p-7"
        >
          <div className="flex gap-1 rounded-2xl bg-night/5 p-1">
            {(["login", "register"] as const).map((key) => (
              <button
                key={key}
                type="button"
                className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition ${
                  mode === key ? "bg-white text-night shadow-sm" : "text-muted hover:text-night"
                }`}
                onClick={() => setMode(key)}
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
              onChange={(e) => setEmail(e.target.value)}
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
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-accent py-3.5 text-sm font-bold text-night transition hover:bg-accent-hover disabled:opacity-50"
          >
            {busy ? t("working") : mode === "login" ? t("login") : t("register")}
          </button>
        </form>
        {msg ? (
          <p
            className={`mt-4 text-center text-sm font-medium ${
              msg.type === "ok" ? "text-teal" : "text-danger"
            }`}
          >
            {msg.text}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl animate-rise pb-[calc(var(--bottom-nav-h,0px)+1.5rem)] md:pb-0">
      <PageHeader
        title={t("title")}
        subtitle={t("welcome", { name: displayName(user) })}
        actions={
          <button
            type="button"
            onClick={logout}
            className="rounded-xl border border-night/12 bg-white px-4 py-2.5 text-sm font-semibold text-muted transition hover:border-danger/30 hover:text-danger"
          >
            {t("logout")}
          </button>
        }
      />

      <section className="mt-6 overflow-hidden rounded-3xl border border-night/8 bg-gradient-to-br from-teal/10 via-white to-accent/15 p-5 sm:p-6">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-teal text-xl font-bold text-paper shadow-sm sm:h-[4.5rem] sm:w-[4.5rem] sm:text-2xl">
            {initials(user)}
          </div>
          <div className="min-w-0">
            <p className="truncate font-display text-xl font-bold text-night">{displayName(user)}</p>
            <p className="mt-0.5 truncate text-sm text-muted">{user.email}</p>
            {user.phone ? <p className="mt-1 text-sm font-medium text-night/70">{user.phone}</p> : null}
          </div>
        </div>
      </section>

      <nav className="mt-4 grid grid-cols-3 gap-2">
        {[
          {
            href: `/${locale}/orders`,
            label: tn("orders"),
            meta: orders.length ? String(orders.length) : "—",
          },
          {
            href: `/${locale}/wishlist`,
            label: tn("wishlist"),
            meta: wishlistCount ? String(wishlistCount) : "—",
          },
          {
            href: `/${locale}/cart`,
            label: t("cartLink"),
            meta: cartCount ? String(cartCount) : "—",
          },
        ].map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-2xl border border-night/8 bg-white px-3 py-3.5 text-center transition hover:border-accent/40 hover:shadow-sm"
          >
            <p className="text-lg font-bold tabular-nums text-night">{item.meta}</p>
            <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted sm:text-xs">
              {item.label}
            </p>
          </Link>
        ))}
      </nav>

      <div className="mt-6 flex gap-1 overflow-x-auto rounded-2xl bg-night/5 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setTab(item.id);
              setEditingProfile(false);
              setShowAddressForm(false);
            }}
            className={`min-h-11 flex-1 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
              tab === item.id ? "bg-white text-night shadow-sm" : "text-muted hover:text-night"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {msg ? (
        <p
          className={`mt-4 rounded-xl px-3 py-2 text-sm font-medium ${
            msg.type === "ok" ? "bg-teal/10 text-teal" : "bg-danger-muted text-danger"
          }`}
          role="status"
        >
          {msg.text}
        </p>
      ) : null}

      {tab === "profile" ? (
        editingProfile ? (
          <form
            onSubmit={saveProfile}
            className="mt-5 space-y-4 rounded-3xl border border-night/8 bg-white p-5 sm:p-6"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-bold text-night">{t("profileTitle")}</h2>
                <p className="mt-1 text-sm text-muted">{t("profileHint")}</p>
              </div>
              <button
                type="button"
                onClick={cancelEditProfile}
                className="text-sm font-semibold text-muted hover:text-night"
              >
                {t("cancel")}
              </button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-night">
                {t("fields.first_name")}
                <input
                  className={fieldClass}
                  value={profile.first_name}
                  onChange={(e) => setProfile({ ...profile, first_name: e.target.value })}
                />
              </label>
              <label className="block text-sm font-medium text-night">
                {t("fields.last_name")}
                <input
                  className={fieldClass}
                  value={profile.last_name}
                  onChange={(e) => setProfile({ ...profile, last_name: e.target.value })}
                />
              </label>
            </div>
            <label className="block text-sm font-medium text-night">
              {t("fields.phone")}
              <input
                className={fieldClass}
                inputMode="tel"
                placeholder="+99890..."
                value={profile.phone}
                onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
              />
            </label>
            <label className="block text-sm font-medium text-night">
              {t("fields.email")}
              <input className={`${fieldClass} opacity-70`} value={user.email} disabled readOnly />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-accent py-3.5 text-sm font-bold text-night transition hover:bg-accent-hover disabled:opacity-50 sm:w-auto sm:px-8"
            >
              {busy ? t("working") : t("save")}
            </button>
          </form>
        ) : (
          <section className="mt-5 rounded-3xl border border-night/8 bg-white p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-bold text-night">{t("profileTitle")}</h2>
                <p className="mt-1 text-sm text-muted">{t("profileHint")}</p>
              </div>
              <button
                type="button"
                onClick={startEditProfile}
                className="rounded-xl border border-night/12 px-3.5 py-2 text-sm font-semibold text-night transition hover:border-accent/40"
              >
                {t("edit")}
              </button>
            </div>
            <dl className="mt-5 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                    {t("fields.first_name")}
                  </dt>
                  <dd className="mt-1 text-sm font-medium text-night">
                    {user.first_name || "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                    {t("fields.last_name")}
                  </dt>
                  <dd className="mt-1 text-sm font-medium text-night">
                    {user.last_name || "—"}
                  </dd>
                </div>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {t("fields.phone")}
                </dt>
                <dd className="mt-1 text-sm font-medium text-night">{user.phone || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {t("fields.email")}
                </dt>
                <dd className="mt-1 text-sm font-medium text-night">{user.email}</dd>
              </div>
            </dl>
          </section>
        )
      ) : null}

      {tab === "addresses" ? (
        <section className="mt-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold text-night">{t("addressesTitle")}</h2>
              <p className="mt-1 text-sm text-muted">{t("addressesHint")}</p>
            </div>
            {!showAddressForm ? (
              <button
                type="button"
                onClick={startCreateAddress}
                className="rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-night hover:bg-accent-hover"
              >
                {t("addAddress")}
              </button>
            ) : null}
          </div>

          {addresses.length === 0 && !showAddressForm ? (
            <div className="rounded-3xl border border-dashed border-night/12 bg-white/60">
              <EmptyState
                title={t("noAddresses")}
                description={t("noAddressesHint")}
                actionHref={undefined}
                actionLabel={undefined}
              />
              <div className="-mt-8 pb-10 text-center">
                <button
                  type="button"
                  onClick={startCreateAddress}
                  className="rounded-xl bg-accent px-6 py-3 text-sm font-bold text-night hover:bg-accent-hover"
                >
                  {t("addAddress")}
                </button>
              </div>
            </div>
          ) : null}

          <ul className="space-y-3">
            {addresses.map((item) => (
              <li
                key={item.id}
                className="rounded-2xl border border-night/8 bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.03)] sm:p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-night">
                        {item.label || item.full_name || t("addressUntitled")}
                      </p>
                      {item.is_default ? (
                        <span className="rounded-full bg-teal/10 px-2 py-0.5 text-[11px] font-bold text-teal">
                          {t("defaultAddress")}
                        </span>
                      ) : null}
                    </div>
                    {item.full_name && item.label ? (
                      <p className="mt-1 text-sm text-night/70">{item.full_name}</p>
                    ) : null}
                    <p className="mt-1 text-sm text-muted">{item.phone}</p>
                    <p className="mt-1.5 text-sm leading-relaxed text-night/75">
                      {[
                        item.region,
                        item.district,
                        item.street,
                        item.building ? `${t("fields.building")} ${item.building}` : null,
                        item.apartment ? `${t("fields.apartment")} ${item.apartment}` : null,
                      ]
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => startEditAddress(item)}
                      className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-teal hover:bg-teal/10"
                    >
                      {t("edit")}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteAddress(item.id)}
                      className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-danger/80 hover:bg-danger-muted"
                    >
                      {t("delete")}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {showAddressForm ? (
            <form
              onSubmit={saveAddress}
              className="space-y-4 rounded-3xl border border-night/8 bg-white p-5 sm:p-6"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-display text-base font-bold text-night">
                  {editingId ? t("editAddress") : t("addAddress")}
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddressForm(false);
                    setEditingId(null);
                  }}
                  className="text-sm font-semibold text-muted hover:text-night"
                >
                  {t("cancel")}
                </button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-medium text-night sm:col-span-2">
                  {t("fields.label")}
                  <input
                    className={fieldClass}
                    placeholder={t("labelPlaceholder")}
                    value={addressForm.label}
                    onChange={(e) => setAddressForm({ ...addressForm, label: e.target.value })}
                  />
                </label>
                <label className="block text-sm font-medium text-night">
                  {t("fields.full_name")}
                  <input
                    required
                    className={fieldClass}
                    value={addressForm.full_name}
                    onChange={(e) => setAddressForm({ ...addressForm, full_name: e.target.value })}
                  />
                </label>
                <label className="block text-sm font-medium text-night">
                  {t("fields.phone")}
                  <input
                    required
                    className={fieldClass}
                    inputMode="tel"
                    value={addressForm.phone}
                    onChange={(e) => setAddressForm({ ...addressForm, phone: e.target.value })}
                  />
                </label>
                <label className="block text-sm font-medium text-night">
                  {t("fields.region")}
                  <select
                    required
                    className={fieldClass}
                    value={addressForm.region}
                    onChange={(e) => setAddressForm({ ...addressForm, region: e.target.value })}
                  >
                    {UZ_REGIONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-medium text-night">
                  {t("fields.district")}
                  <input
                    className={fieldClass}
                    value={addressForm.district}
                    onChange={(e) => setAddressForm({ ...addressForm, district: e.target.value })}
                  />
                </label>
                <label className="block text-sm font-medium text-night sm:col-span-2">
                  {t("fields.street")}
                  <input
                    required
                    className={fieldClass}
                    value={addressForm.street}
                    onChange={(e) => setAddressForm({ ...addressForm, street: e.target.value })}
                  />
                </label>
                <label className="block text-sm font-medium text-night">
                  {t("fields.building")}
                  <input
                    className={fieldClass}
                    value={addressForm.building}
                    onChange={(e) => setAddressForm({ ...addressForm, building: e.target.value })}
                  />
                </label>
                <label className="block text-sm font-medium text-night">
                  {t("fields.apartment")}
                  <input
                    className={fieldClass}
                    value={addressForm.apartment}
                    onChange={(e) => setAddressForm({ ...addressForm, apartment: e.target.value })}
                  />
                </label>
              </div>
              <label className="flex items-center gap-2.5 text-sm font-medium text-night">
                <input
                  type="checkbox"
                  checked={addressForm.is_default}
                  onChange={(e) => setAddressForm({ ...addressForm, is_default: e.target.checked })}
                  className="h-4 w-4 rounded border-night/20 text-teal focus:ring-teal/30"
                />
                {t("setDefault")}
              </label>
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-xl bg-accent py-3.5 text-sm font-bold text-night hover:bg-accent-hover disabled:opacity-50"
              >
                {busy ? t("working") : t("saveAddress")}
              </button>
            </form>
          ) : null}
        </section>
      ) : null}

      {tab === "orders" ? (
        <section className="mt-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-bold text-night">{t("ordersTitle")}</h2>
              <p className="mt-1 text-sm text-muted">{t("ordersHint")}</p>
            </div>
            <Link
              href={`/${locale}/orders`}
              className="text-sm font-bold text-teal hover:underline"
            >
              {t("viewAllOrders")}
            </Link>
          </div>

          {recentOrders.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-night/12 bg-white/60">
              <EmptyState
                title={t("noOrders")}
                description={t("noOrdersHint")}
                actionHref={`/${locale}/products`}
                actionLabel={t("browseCatalog")}
              />
            </div>
          ) : (
            <ul className="space-y-3">
              {recentOrders.map((o) => (
                <li key={o.id}>
                  <Link
                    href={`/${locale}/orders/${o.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-night/8 bg-white p-4 transition hover:border-accent/30 hover:shadow-sm sm:p-5"
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-night">{o.order_number}</p>
                      <p className="mt-1 text-xs text-muted">
                        {o.created_at
                          ? new Date(o.created_at).toLocaleDateString(locale)
                          : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <StatusBadge status={o.status} label={orderStatusLabel(to, o.status)} />
                      <p className="text-sm font-bold text-night">
                        {formatUZS(o.total, locale as Locale)}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
