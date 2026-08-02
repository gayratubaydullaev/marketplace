"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { api, hasClientSessionFlag, logoutSession } from "@/lib/api";
import { UZ_REGIONS } from "@/lib/regions";
import { useWishlist } from "@/lib/wishlist";
import { useCart } from "@/lib/cart";
import { EmptyState, PageHeader } from "@/components/PageChrome";
import { MapPinField } from "@/components/MapPinField";
import { AccountAuthForm } from "@/components/account/AccountAuthForm";
import { AccountOrderLookup } from "@/components/account/AccountOrderLookup";
import { AccountOrdersList } from "@/components/account/AccountOrdersList";
import { AccountAddressCard } from "@/components/account/AccountAddressCard";
import {
  type Tab,
  type User,
  type Address,
  type Order,
  type AddressForm,
  fieldClass,
  initials,
  displayName,
  safeNextPath,
} from "@/components/account/types";

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
  lat: null,
  lng: null,
});

export default function AccountPage() {
  return (
    <Suspense
      fallback={
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
      }
    >
      <AccountInner />
    </Suspense>
  );
}

function AccountInner() {
  const t = useTranslations("account");
  const to = useTranslations("orders");
  const tn = useTranslations("nav");
  const locale = useLocale();
  const router = useRouter();
  const searchParams = useSearchParams();
  const wishlistCount = useWishlist((s) => s.items.length);
  const syncWishlistToServer = useWishlist((s) => s.syncToServer);
  const syncCartToServer = useCart((s) => s.syncToServer);
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
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState("");
  const [addressForm, setAddressForm] = useState<AddressForm>(emptyAddressForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [settingDefaultId, setSettingDefaultId] = useState<string | null>(null);
  const [lookupNumber, setLookupNumber] = useState("");
  const [lookupPhone, setLookupPhone] = useState("+998");
  const [lookupMsg, setLookupMsg] = useState("");
  const [looking, setLooking] = useState(false);

  const flash = useCallback((type: "ok" | "err", text: string) => {
    setMsg({ type, text });
    window.setTimeout(() => setMsg(null), 3200);
  }, []);

  const goTab = useCallback(
    (next: Tab) => {
      setTab(next);
      setEditingProfile(false);
      setShowAddressForm(false);
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", next);
      params.delete("next");
      router.replace(`/${locale}/account?${params.toString()}`, { scroll: false });
    },
    [locale, router, searchParams]
  );

  const loadAddresses = useCallback(async () => {
    const data = await api<{ items?: Address[]; addresses?: Address[] }>("/v1/addresses");
    setAddresses(data.items || data.addresses || []);
  }, []);

  const loadOrders = useCallback(async () => {
    setOrdersLoading(true);
    setOrdersError("");
    try {
      const data = await api<{ items: Order[] }>("/v1/orders");
      setOrders(data.items || []);
    } catch (err) {
      setOrders([]);
      setOrdersError(err instanceof Error ? err.message : to("loadError"));
    } finally {
      setOrdersLoading(false);
    }
  }, [to]);

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam === "orders" || tabParam === "addresses" || tabParam === "profile") {
      setTab(tabParam);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!hasClientSessionFlag()) {
      loadOrders().finally(() => setBootstrapping(false));
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
      loadOrders(),
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
      // Tokens are stored in httpOnly cookies by the BFF — never localStorage.
      await Promise.all([
        syncWishlistToServer().catch(() => undefined),
        syncCartToServer().catch(() => undefined),
      ]);
      setUser(data.user);
      setProfile({
        first_name: data.user.first_name || "",
        last_name: data.user.last_name || "",
        phone: data.user.phone || "",
      });
      await Promise.all([loadAddresses(), loadOrders()]);
      flash("ok", mode === "login" ? t("loginSuccess") : t("registerSuccess"));

      const next = safeNextPath(searchParams.get("next"), locale);
      if (next) {
        router.replace(next);
        return;
      }
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
      lat: item.lat ?? null,
      lng: item.lng ?? null,
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
      lat: addressForm.lat,
      lng: addressForm.lng,
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

  async function makeDefaultAddress(item: Address) {
    setSettingDefaultId(item.id);
    try {
      await api(`/v1/addresses/${item.id}`, {
        method: "PUT",
        body: JSON.stringify({
          label: item.label || null,
          full_name: item.full_name,
          phone: item.phone,
          region: item.region,
          district: item.district || null,
          street: item.street,
          building: item.building || null,
          apartment: item.apartment || null,
          is_default: true,
          lat: item.lat ?? null,
          lng: item.lng ?? null,
        }),
      });
      await loadAddresses();
      flash("ok", t("saved"));
    } catch {
      flash("err", t("saveError"));
    } finally {
      setSettingDefaultId(null);
    }
  }

  async function logout() {
    await logoutSession();
    window.location.assign(`/${locale}`);
  }

  async function lookupOrder(e: React.FormEvent) {
    e.preventDefault();
    setLooking(true);
    setLookupMsg("");
    try {
      const res = await api<{ order: Order }>("/v1/orders/lookup", {
        method: "POST",
        body: JSON.stringify({
          order_number: lookupNumber.trim(),
          phone: lookupPhone.trim(),
        }),
      });
      if (res.order?.id) {
        window.location.assign(`/${locale}/orders/${res.order.id}`);
        return;
      }
      setLookupMsg(to("lookupNotFound"));
    } catch {
      setLookupMsg(to("lookupNotFound"));
    } finally {
      setLooking(false);
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "orders", label: t("ordersTab") },
    { id: "addresses", label: t("addresses") },
    { id: "profile", label: t("profile") },
  ];

  const profileIncomplete =
    !user?.first_name?.trim() || !user?.last_name?.trim() || !user?.phone?.trim();

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

        <div className="mt-6">
          <AccountAuthForm
            mode={mode}
            onModeChange={setMode}
            email={email}
            password={password}
            onEmailChange={setEmail}
            onPasswordChange={setPassword}
            busy={busy}
            onSubmit={submitAuth}
            msg={msg}
          />
        </div>

        <div className="mt-5">
          <AccountOrderLookup
            lookupNumber={lookupNumber}
            lookupPhone={lookupPhone}
            onNumberChange={setLookupNumber}
            onPhoneChange={setLookupPhone}
            looking={looking}
            lookupMsg={lookupMsg}
            onSubmit={lookupOrder}
          />
        </div>

        {!ordersLoading && orders.length > 0 ? (
          <div className="mt-6">
            <h2 className="mb-3 font-display text-base font-bold text-night">{t("guestOrdersTitle")}</h2>
            <AccountOrdersList orders={orders} loading={false} emptyTitle={t("noOrders")} />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl animate-rise pb-[calc(var(--bottom-nav-h,0px)+1.5rem)] md:pb-0">
      <PageHeader title={t("title")} subtitle={t("welcome", { name: displayName(user) })} />

      <section className="mt-5 overflow-hidden rounded-3xl border border-night/8 bg-gradient-to-br from-teal/10 via-white to-accent/15 p-4 sm:p-5">
        <div className="flex items-center gap-3.5">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-teal text-lg font-bold text-paper shadow-sm sm:h-16 sm:w-16 sm:text-xl">
            {initials(user)}
          </div>
          <div className="min-w-0">
            <p className="truncate font-display text-lg font-bold text-night sm:text-xl">
              {displayName(user)}
            </p>
            <p className="mt-0.5 truncate text-sm text-muted">{user.email}</p>
            {user.phone ? (
              <p className="mt-0.5 text-sm font-medium text-night/70">{user.phone}</p>
            ) : null}
          </div>
        </div>
      </section>

      <nav className="mt-4 grid grid-cols-3 gap-2">
        {[
          {
            id: "orders" as const,
            label: tn("orders"),
            meta: orders.length ? String(orders.length) : "—",
            onClick: () => goTab("orders"),
            active: tab === "orders",
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
        ].map((item) =>
          "onClick" in item && item.onClick ? (
            <button
              key={item.id}
              type="button"
              onClick={item.onClick}
              className={`rounded-2xl border px-3 py-3.5 text-center transition hover:border-accent/40 hover:shadow-sm ${
                item.active ? "border-accent/40 bg-accent/10" : "border-night/8 bg-white"
              }`}
            >
              <p className="text-lg font-bold tabular-nums text-night">{item.meta}</p>
              <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted sm:text-xs">
                {item.label}
              </p>
            </button>
          ) : (
            <Link
              key={item.href}
              href={item.href!}
              className="rounded-2xl border border-night/8 bg-white px-3 py-3.5 text-center transition hover:border-accent/40 hover:shadow-sm"
            >
              <p className="text-lg font-bold tabular-nums text-night">{item.meta}</p>
              <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted sm:text-xs">
                {item.label}
              </p>
            </Link>
          )
        )}
      </nav>

      <div className="mt-5 flex gap-1 overflow-x-auto rounded-2xl bg-night/5 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => goTab(item.id)}
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
          <section className="mt-5 space-y-4">
            {profileIncomplete ? (
              <div className="rounded-2xl border border-amber-200/80 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
                <p className="font-semibold">{t("profileIncompleteTitle")}</p>
                <p className="mt-0.5 text-amber-800/90">{t("profileIncompleteHint")}</p>
                <button
                  type="button"
                  onClick={startEditProfile}
                  className="mt-2 text-sm font-bold text-teal hover:underline"
                >
                  {t("edit")}
                </button>
              </div>
            ) : null}
            <div className="rounded-3xl border border-night/8 bg-white p-5 sm:p-6">
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
            </div>
            <button
              type="button"
              onClick={logout}
              className="w-full rounded-xl border border-night/12 bg-white px-4 py-3 text-sm font-semibold text-muted transition hover:border-danger/30 hover:text-danger"
            >
              {t("logout")}
            </button>
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
            {!showAddressForm && addresses.length > 0 ? (
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
                actionLabel={t("addAddress")}
                onAction={startCreateAddress}
                variant="generic"
              />
            </div>
          ) : null}

          <ul className="space-y-3">
            {addresses.map((item) => (
              <AccountAddressCard
                key={item.id}
                item={item}
                onEdit={() => startEditAddress(item)}
                onDelete={() => void deleteAddress(item.id)}
                onSetDefault={() => void makeDefaultAddress(item)}
                settingDefault={settingDefaultId === item.id}
              />
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
                <div className="sm:col-span-2">
                  <p className="mb-1.5 text-sm font-medium text-night">{t("mapPin")}</p>
                  <MapPinField
                    value={
                      addressForm.lat != null && addressForm.lng != null
                        ? { lat: addressForm.lat, lng: addressForm.lng }
                        : null
                    }
                    onChange={(p) =>
                      setAddressForm({
                        ...addressForm,
                        lat: p?.lat ?? null,
                        lng: p?.lng ?? null,
                      })
                    }
                    searchHint={t("mapSearch")}
                    pinHint={t("mapPinHint")}
                    autoLocate={!(addressForm.lat != null && addressForm.lng != null)}
                    locateLabel={t("mapLocate")}
                    locatingLabel={t("mapLocating")}
                    locateDeniedLabel={t("mapLocateDenied")}
                    locateUnavailableLabel={t("mapLocateUnavailable")}
                    editHint={t("mapEditHint")}
                  />
                </div>
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
          <div>
            <h2 className="font-display text-lg font-bold text-night">{t("ordersTitle")}</h2>
            <p className="mt-1 text-sm text-muted">{t("ordersHint")}</p>
          </div>
          <AccountOrdersList
            orders={orders}
            loading={ordersLoading}
            emptyTitle={t("noOrders")}
            error={ordersError || undefined}
            onRetry={ordersError ? () => void loadOrders() : undefined}
          />
        </section>
      ) : null}
    </div>
  );
}
