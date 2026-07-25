"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { formatUZS, type Locale } from "@gayrat/i18n";
import { useCart } from "@/lib/cart";
import { api } from "@/lib/api";
import { EmptyState, PageHeader } from "@/components/PageChrome";
import { MobileStickyPortal } from "@/components/MobileStickyPortal";
import { MapPinField, type Pin } from "@/components/MapPinField";
import { UZ_REGIONS } from "@/lib/regions";

const REGIONS = UZ_REGIONS;

const PAYMENTS = [
  { id: "cash_on_delivery", labelKey: "payCash" as const },
  { id: "card_on_delivery", labelKey: "payCardOnDelivery" as const },
  { id: "payme", labelKey: "payPayme" as const },
  { id: "click", labelKey: "payClick" as const },
  { id: "uzum", labelKey: "payUzum" as const },
  { id: "stripe", labelKey: "payStripe" as const },
  { id: "bank_transfer", labelKey: "payBank" as const },
] as const;

const COD_PROVIDERS = new Set(["cash_on_delivery", "card_on_delivery", "bank_transfer"]);

type Address = {
  id: string;
  label?: string;
  region?: string;
  district?: string;
  address_line1?: string;
  street?: string;
  building?: string;
  apartment?: string;
  phone?: string;
  lat?: number | null;
  lng?: number | null;
};

const fieldClass =
  "mt-1.5 w-full rounded-xl border border-night/10 bg-surface-muted px-3.5 py-2.5 text-sm outline-none focus:border-accent/40 focus:bg-white";

export default function CheckoutPage() {
  const t = useTranslations("checkout");
  const locale = useLocale();
  const { items, total, syncToServer, clear } = useCart();
  const [loggedIn, setLoggedIn] = useState(false);
  const [guestMode, setGuestMode] = useState(true);
  const [guestEmail, setGuestEmail] = useState("");
  const [delivery, setDelivery] = useState<"courier" | "pickup">("courier");
  const [region, setRegion] = useState("Toshkent shahri");
  const [district, setDistrict] = useState("");
  const [street, setStreet] = useState("");
  const [building, setBuilding] = useState("");
  const [apartment, setApartment] = useState("");
  const [phone, setPhone] = useState("+998");
  const [pin, setPin] = useState<Pin | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [selectedAddress, setSelectedAddress] = useState("");
  const [shippingCost, setShippingCost] = useState(15000);
  const [provider, setProvider] = useState("cash_on_delivery");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const has = Boolean(localStorage.getItem("access_token"));
    setLoggedIn(has);
    setGuestMode(!has);
  }, []);

  useEffect(() => {
    if (!loggedIn) return;
    api<{ addresses?: Address[] } | Address[]>("/v1/addresses")
      .then((response) => {
        const loaded = Array.isArray(response) ? response : response.addresses || [];
        setAddresses(loaded);
      })
      .catch(() => undefined);
  }, [loggedIn]);

  useEffect(() => {
    if (delivery === "pickup") {
      setShippingCost(0);
      return;
    }
    const goods = total();
    if (goods <= 0) {
      setShippingCost(0);
      return;
    }
    const fallback = region === "Toshkent shahri" ? 15000 : 25000;
    api<{ shipping_cost?: number; cost?: number; total?: number }>("/v1/cart/shipping-estimate", {
      method: "POST",
      body: JSON.stringify({ region, district, subtotal: goods }),
    })
      .then((estimate) => setShippingCost(estimate.shipping_cost ?? estimate.cost ?? estimate.total ?? fallback))
      .catch(() => setShippingCost(fallback));
  }, [region, district, delivery, items.length]);

  function chooseAddress(id: string) {
    setSelectedAddress(id);
    const address = addresses.find((item) => item.id === id);
    if (!address) return;
    setRegion(address.region || "Toshkent shahri");
    setDistrict(address.district || "");
    setStreet(address.street || address.address_line1 || "");
    setBuilding(address.building || "");
    setApartment(address.apartment || "");
    setPhone(address.phone || "+998");
    if (address.lat != null && address.lng != null) {
      setPin({ lat: address.lat, lng: address.lng });
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (items.length === 0) return;
    setLoading(true);
    setStatus("");
    try {
      await syncToServer(true);
      const cart = await api<{ cart: { id: string }; items?: { id: string }[] }>("/v1/cart");
      if (!cart.cart?.id || !(cart.items && cart.items.length > 0)) {
        throw new Error("Cart sync failed — add items again");
      }
      const order = await api<{ id: string; order_number: string }>("/v1/orders", {
        method: "POST",
        body: JSON.stringify({
          cart_id: cart.cart.id,
          guest_email: guestMode && guestEmail.trim() ? guestEmail.trim() : undefined,
          payment_method: provider,
          shipping_address: {
            region: delivery === "pickup" ? "pickup" : region,
            district: delivery === "pickup" ? "store" : district,
            street: delivery === "pickup" ? undefined : street,
            building: delivery === "pickup" ? undefined : building || undefined,
            apartment: delivery === "pickup" ? undefined : apartment || undefined,
            address_line1:
              delivery === "pickup"
                ? undefined
                : [street, building && `uy ${building}`, apartment && `xonadon ${apartment}`]
                    .filter(Boolean)
                    .join(", "),
            phone,
            country: "UZ",
            delivery_method: delivery,
            ...(delivery === "courier" && pin ? { lat: pin.lat, lng: pin.lng } : {}),
          },
          shipping_cost: shippingCost,
          address_id: selectedAddress || undefined,
        }),
      });
      const intent = await api<{ id: string; redirect_url?: string }>("/v1/payments/intent", {
        method: "POST",
        body: JSON.stringify({
          order_id: order.id,
          provider,
          idempotency_key: `chk-${order.id}`,
        }),
      });
      sessionStorage.setItem("pending_order_id", order.id);
      sessionStorage.setItem("pending_order_number", order.order_number || "");
      try {
        const raw = localStorage.getItem("guest_orders");
        const list: { id: string; order_number: string; at: number }[] = raw ? JSON.parse(raw) : [];
        const next = [{ id: order.id, order_number: order.order_number || "", at: Date.now() }, ...list.filter((x) => x.id !== order.id)].slice(0, 20);
        localStorage.setItem("guest_orders", JSON.stringify(next));
      } catch {
        /* ignore */
      }
      clear();
      if (COD_PROVIDERS.has(provider) || !intent.redirect_url) {
        window.location.assign(`/${locale}/orders/${order.id}`);
        return;
      }
      const returnUrl = `${window.location.origin}/${locale}/orders/${order.id}/payment-return`;
      let redirectHref = intent.redirect_url;
      try {
        const redirect = new URL(intent.redirect_url, window.location.origin);
        redirect.searchParams.set("payment_id", intent.id);
        redirect.searchParams.set("return_url", returnUrl);
        redirectHref = redirect.toString();
      } catch {
        const join = intent.redirect_url.includes("?") ? "&" : "?";
        redirectHref = `${intent.redirect_url}${join}payment_id=${encodeURIComponent(intent.id)}&return_url=${encodeURIComponent(returnUrl)}`;
      }
      window.location.assign(redirectHref);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "error");
    } finally {
      setLoading(false);
    }
  }

  if (items.length === 0) {
    return (
      <div className="animate-rise py-6">
        <PageHeader title={t("title")} />
        <div className="mt-8">
          <EmptyState title={t("emptyCart")} actionHref={`/${locale}/products`} actionLabel={t("browse")} />
        </div>
      </div>
    );
  }

  const steps = [
    { id: 1, label: t("stepContact") },
    { id: 2, label: t("stepDelivery") },
    { id: 3, label: t("stepPayment") },
  ];

  return (
    <div className="mx-auto max-w-2xl animate-rise pb-[calc(var(--sticky-action-h)+1rem)] md:pb-0">
      <PageHeader title={t("title")} />
      <p className="mt-2 text-lg font-bold text-night">
        {formatUZS(total() + shippingCost, locale as Locale)}
      </p>

      <ol className="mt-6 flex items-center justify-between gap-1 text-xs sm:gap-2 sm:text-sm">
        {steps.map((step, i) => (
          <li key={step.id} className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal text-[11px] font-bold text-paper">
              {step.id}
            </span>
            <span className="hidden truncate font-semibold text-night/80 sm:inline">{step.label}</span>
            {i < steps.length - 1 ? (
              <span className="ms-auto hidden h-px min-w-4 flex-1 bg-night/10 sm:block" />
            ) : null}
          </li>
        ))}
      </ol>

      <section className="mt-8 border-y border-night/8 py-5">
        <h2 className="text-xs font-bold uppercase tracking-wide text-muted">{t("orderPreview")}</h2>
        <ul className="mt-3 space-y-2.5 text-sm">
          {items.map((item) => (
            <li key={`${item.product_id}:${item.variant_id || ""}`} className="flex justify-between gap-3">
              <span className="min-w-0 truncate text-night/80">
                {item.title} × {item.quantity}
              </span>
              <span className="shrink-0 font-semibold">
                {formatUZS(item.unit_price * item.quantity, locale as Locale)}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-3 space-y-1 border-t border-night/8 pt-3 text-sm">
          <p className="flex justify-between">
            <span className="text-muted">{t("items")}</span>
            <span>{formatUZS(total(), locale as Locale)}</span>
          </p>
          <p className="flex justify-between">
            <span className="text-muted">{t("shipping")}</span>
            <span>{formatUZS(shippingCost, locale as Locale)}</span>
          </p>
          <p className="flex justify-between pt-1 text-base font-bold">
            <span>{t("total")}</span>
            <span>{formatUZS(total() + shippingCost, locale as Locale)}</span>
          </p>
        </div>
      </section>

      <div className="mt-6 flex gap-2 text-sm">
        {loggedIn && (
          <button
            type="button"
            onClick={() => setGuestMode(false)}
            className={`rounded-full px-4 py-2 font-medium ${
              !guestMode ? "bg-accent text-night" : "border border-night/12"
            }`}
          >
            {t("asMember")}
          </button>
        )}
        <button
          type="button"
          onClick={() => setGuestMode(true)}
          className={`rounded-full px-4 py-2 font-medium ${
            guestMode ? "bg-accent text-night" : "border border-night/12"
          }`}
        >
          {t("guest")}
        </button>
      </div>

      <form id="checkout-form" onSubmit={submit} className="mt-8 space-y-8">
        <section>
          <h2 className="font-display text-base font-bold text-night">1. {t("stepContact")}</h2>
          <div className="mt-3 space-y-3">
            {guestMode && (
              <label className="block text-sm font-medium">
                {t("guestEmail")}{" "}
                <span className="font-normal text-muted">({t("optional")})</span>
                <input
                  type="email"
                  className={fieldClass}
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </label>
            )}
            <label className="block text-sm font-medium">
              {t("phone")}
              <input
                className={fieldClass}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </label>
          </div>
        </section>

        <section>
          <h2 className="font-display text-base font-bold text-night">2. {t("stepDelivery")}</h2>
          <fieldset className="mt-3 space-y-2">
            <legend className="sr-only">{t("deliveryMethod")}</legend>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDelivery("courier")}
                className={`rounded-xl border px-3 py-3 text-sm font-semibold ${
                  delivery === "courier" ? "border-accent bg-accent/10 text-night" : "border-night/12"
                }`}
              >
                {t("courier")}
              </button>
              <button
                type="button"
                onClick={() => setDelivery("pickup")}
                className={`rounded-xl border px-3 py-3 text-sm font-semibold ${
                  delivery === "pickup" ? "border-accent bg-accent/10 text-night" : "border-night/12"
                }`}
              >
                {t("pickup")}
              </button>
            </div>
          </fieldset>

          {!guestMode && addresses.length > 0 && delivery === "courier" && (
            <label className="mt-3 block text-sm font-medium">
              {t("savedAddress")}
              <select
                className={fieldClass}
                value={selectedAddress}
                onChange={(event) => chooseAddress(event.target.value)}
              >
                <option value="">{t("newAddress")}</option>
                {addresses.map((address) => (
                  <option key={address.id} value={address.id}>
                    {[address.label, address.region, address.district || address.address_line1]
                      .filter(Boolean)
                      .join(" — ")}
                  </option>
                ))}
              </select>
            </label>
          )}

          {delivery === "courier" && (
            <div className="mt-3 space-y-3">
              <label className="block text-sm font-medium">
                {t("region")}
                <select
                  className={fieldClass}
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                >
                  {REGIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium">
                {t("district")}
                <input
                  className={fieldClass}
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                />
              </label>
              <label className="block text-sm font-medium">
                {t("street")}
                <input
                  className={fieldClass}
                  value={street}
                  onChange={(e) => setStreet(e.target.value)}
                  required={delivery === "courier"}
                  placeholder="G'argali"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm font-medium">
                  {t("building")}
                  <input
                    className={fieldClass}
                    value={building}
                    onChange={(e) => setBuilding(e.target.value)}
                    required={delivery === "courier"}
                    placeholder="94"
                    inputMode="text"
                  />
                </label>
                <label className="block text-sm font-medium">
                  {t("apartment")}
                  <input
                    className={fieldClass}
                    value={apartment}
                    onChange={(e) => setApartment(e.target.value)}
                    placeholder="12"
                    inputMode="text"
                  />
                </label>
              </div>
              <p className="text-xs text-muted">{t("mapAutoHint")}</p>
              <div>
                <p className="mb-1.5 text-sm font-medium">{t("mapPin")}</p>
                <MapPinField
                  value={pin}
                  onChange={setPin}
                  searchHint={t("mapSearch")}
                  pinHint={t("mapPinHint")}
                  contextQuery={[street, building, district, region].filter(Boolean).join(", ")}
                  lookupQuery={
                    street.trim() && building.trim()
                      ? [street.trim(), building.trim(), district.trim(), region.trim()]
                          .filter(Boolean)
                          .join(", ")
                      : ""
                  }
                  autoLocate={!street && !building}
                  locateLabel={t("mapLocate")}
                  locatingLabel={t("mapLocating")}
                  locateDeniedLabel={t("mapLocateDenied")}
                  locateUnavailableLabel={t("mapLocateUnavailable")}
                  editHint={t("mapEditHint")}
                />
              </div>
            </div>
          )}

          <p className="mt-3 text-sm text-muted">
            {t("shipping")}: {formatUZS(shippingCost, locale as Locale)}
          </p>
        </section>

        <section>
          <h2 className="font-display text-base font-bold text-night">3. {t("stepPayment")}</h2>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {PAYMENTS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setProvider(p.id)}
                className={`rounded-xl border px-3 py-3.5 text-sm font-bold transition ${
                  provider === p.id
                    ? "border-accent bg-accent/15 text-night ring-1 ring-accent/40"
                    : "border-night/12 bg-white hover:border-accent/40"
                }`}
              >
                {t(p.labelKey)}
              </button>
            ))}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-6 hidden w-full rounded-xl bg-accent py-3.5 text-sm font-bold text-night transition hover:bg-accent-hover disabled:opacity-50 lg:block"
          >
            {COD_PROVIDERS.has(provider) ? t("placeOrder") : t("pay")}
          </button>
          <p className="mt-3 hidden text-center text-xs text-muted lg:block">{t("trust")}</p>
        </section>
      </form>

      {status ? <p className="mt-4 text-sm text-danger">{status}</p> : null}
      <p className="mt-6 hidden text-center text-sm lg:block">
        <Link href={`/${locale}/cart`} className="font-semibold text-teal hover:underline">
          ← {t("backToCart")}
        </Link>
      </p>

      <MobileStickyPortal>
        <div className="flex w-full items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-night">
              {formatUZS(total() + shippingCost, locale as Locale)}
            </p>
            <p className="text-[10px] text-muted">{t("trust")}</p>
          </div>
          <button
            type="submit"
            form="checkout-form"
            disabled={loading}
            className="min-h-11 shrink-0 rounded-xl bg-accent px-5 text-sm font-bold text-night disabled:opacity-50"
          >
            {COD_PROVIDERS.has(provider) ? t("placeOrder") : t("pay")}
          </button>
        </div>
      </MobileStickyPortal>
    </div>
  );
}
