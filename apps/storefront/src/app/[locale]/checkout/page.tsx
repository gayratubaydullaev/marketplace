"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { formatUZS, type Locale } from "@gayrat/i18n";
import { useCart } from "@/lib/cart";
import { api, hasClientSessionFlag } from "@/lib/api";
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
  { id: "paypal", labelKey: "payPaypal" as const },
  { id: "bank_transfer", labelKey: "payBank" as const },
] as const;

const COD_PROVIDERS = new Set(["cash_on_delivery", "card_on_delivery", "bank_transfer"]);

type CheckoutPreview = {
  subtotal?: number;
  discount?: number;
  gift?: number;
  shipping_cost?: number;
  total?: number;
};

/** Prefer local line totals when server returns 0 but the UI cart still has priced items. */
function resolveMoney(serverVal: number | undefined, localVal: number) {
  if (typeof serverVal !== "number") return localVal;
  if (serverVal === 0 && localVal > 0) return localVal;
  return serverVal;
}

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
  const [preview, setPreview] = useState<CheckoutPreview>({});
  const [shippingCost, setShippingCost] = useState(15000);
  const [provider, setProvider] = useState("cash_on_delivery");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [activeStep, setActiveStep] = useState(1);
  const stepContactRef = useRef<HTMLElement>(null);
  const stepDeliveryRef = useRef<HTMLElement>(null);
  const stepPaymentRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const has = hasClientSessionFlag();
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
    if (items.length === 0) {
      setPreview({});
      return;
    }
    let cancelled = false;
    const goods = total();
    const fallback = region === "Toshkent shahri" ? 15000 : 25000;

    (async () => {
      setPreviewLoading(true);
      try {
        await syncToServer();
        const est = await api<CheckoutPreview>("/v1/cart/checkout-preview", {
          method: "POST",
          body: JSON.stringify({ region: delivery === "pickup" ? "Toshkent shahri" : region }),
        });
        if (cancelled) return;
        setPreview(est);
        if (delivery === "pickup") {
          setShippingCost(0);
        } else {
          setShippingCost(est.shipping_cost ?? fallback);
        }
      } catch {
        if (cancelled) return;
        if (delivery === "pickup") {
          setShippingCost(0);
          return;
        }
        if (goods <= 0) {
          setShippingCost(0);
          return;
        }
        api<{ shipping_cost?: number; cost?: number; total?: number }>("/v1/cart/shipping-estimate", {
          method: "POST",
          body: JSON.stringify({ region, district, subtotal: goods }),
        })
          .then((estimate) => {
            if (!cancelled) {
              setShippingCost(estimate.shipping_cost ?? estimate.cost ?? estimate.total ?? fallback);
            }
          })
          .catch(() => {
            if (!cancelled) setShippingCost(fallback);
          });
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [region, district, delivery, items.length]);

  useEffect(() => {
    const sections = [
      { ref: stepContactRef, step: 1 },
      { ref: stepDeliveryRef, step: 2 },
      { ref: stepPaymentRef, step: 3 },
    ];
    const visible = new Map<number, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const match = sections.find((s) => s.ref.current === entry.target);
          if (!match) continue;
          if (entry.isIntersecting) {
            visible.set(match.step, entry.intersectionRatio);
          } else {
            visible.delete(match.step);
          }
        }
        if (visible.size === 0) return;
        const best = [...visible.entries()].sort((a, b) => b[1] - a[1])[0];
        if (best) setActiveStep(best[0]);
      },
      { rootMargin: "-20% 0px -55% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] }
    );
    for (const { ref } of sections) {
      if (ref.current) observer.observe(ref.current);
    }
    return () => observer.disconnect();
  }, [items.length]);

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
          shipping_cost: shipping,
          address_id: selectedAddress || undefined,
        }),
      });
      const intent = await api<{ id: string; redirect_url?: string }>("/v1/payments/intent", {
        method: "POST",
        body: JSON.stringify({
          order_id: order.id,
          provider,
          idempotency_key: `chk-${order.id}`,
          metadata: { locale },
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
      // Clear cart only for COD/bank (order placed). Online PSP clears on payment-return when paid.
      if (COD_PROVIDERS.has(provider) || !intent.redirect_url) {
        clear();
        window.location.assign(`/${locale}/orders/${order.id}`);
        return;
      }
      const returnUrl = `${window.location.origin}/${locale}/orders/${order.id}/payment-return`;
      let redirectHref = intent.redirect_url;
      try {
        const redirect = new URL(intent.redirect_url, window.location.origin);
        const apiBase = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8080";
        const paymentsBase = process.env.NEXT_PUBLIC_PAYMENTS_BASE || "";
        const allowedHosts = new Set<string>([
          window.location.hostname,
          "localhost",
          "127.0.0.1",
          // Live PSP checkout hosts
          "checkout.paycom.uz",
          "test.paycom.uz",
          "checkout.payme.uz",
          "my.click.uz",
          "www.uzumbank.uz",
          "uzumbank.uz",
          "checkout.stripe.com",
          "pay.stripe.com",
          "www.paypal.com",
          "www.sandbox.paypal.com",
        ]);
        for (const base of [apiBase, paymentsBase]) {
          try {
            if (base) allowedHosts.add(new URL(base, window.location.origin).hostname);
          } catch {
            /* ignore */
          }
        }
        // Only append return_url to our own/sandbox hosts — PSP URLs already include return.
        const localOrGateway =
          redirect.hostname === window.location.hostname ||
          redirect.hostname === "localhost" ||
          redirect.hostname === "127.0.0.1" ||
          (!!apiBase && redirect.hostname === new URL(apiBase, window.location.origin).hostname) ||
          (!!paymentsBase && redirect.hostname === new URL(paymentsBase, window.location.origin).hostname);
        if (!allowedHosts.has(redirect.hostname)) {
          setStatus("unsafe payment redirect");
          return;
        }
        if (localOrGateway) {
          redirect.searchParams.set("payment_id", intent.id);
          redirect.searchParams.set("return_url", returnUrl);
        }
        redirectHref = redirect.toString();
      } catch {
        setStatus("invalid payment redirect");
        return;
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
          <EmptyState title={t("emptyCart")} actionHref={`/${locale}/products`} actionLabel={t("browse")} variant="cart" />
        </div>
      </div>
    );
  }

  const steps = [
    { id: 1, label: t("stepContact") },
    { id: 2, label: t("stepDelivery") },
    { id: 3, label: t("stepPayment") },
  ];

  const localSubtotal = total();
  const subtotal = resolveMoney(preview.subtotal, localSubtotal);
  const discount = preview.discount ?? 0;
  const giftAmt = preview.gift ?? 0;
  const merchandise = resolveMoney(preview.total, Math.max(0, subtotal - discount - giftAmt));
  const shipping = delivery === "pickup" ? 0 : (preview.shipping_cost ?? shippingCost);
  const grandTotal = merchandise + shipping;

  const summaryBreakdown = (
    <div className="space-y-1.5 text-sm">
      <p className="flex justify-between gap-3">
        <span className="text-muted">{t("subtotal")}</span>
        <span className="tabular-nums">{formatUZS(subtotal, locale as Locale)}</span>
      </p>
      {discount > 0 ? (
        <p className="flex justify-between gap-3 text-teal">
          <span>{t("discount")}</span>
          <span className="tabular-nums">−{formatUZS(discount, locale as Locale)}</span>
        </p>
      ) : null}
      {giftAmt > 0 ? (
        <p className="flex justify-between gap-3 text-teal">
          <span>{t("gift")}</span>
          <span className="tabular-nums">−{formatUZS(giftAmt, locale as Locale)}</span>
        </p>
      ) : null}
      {discount > 0 || giftAmt > 0 ? (
        <p className="flex justify-between gap-3 font-medium">
          <span className="text-muted">{t("items")}</span>
          <span className="tabular-nums">{formatUZS(merchandise, locale as Locale)}</span>
        </p>
      ) : null}
      <p className="flex justify-between gap-3">
        <span className="text-muted">{t("shipping")}</span>
        <span className="tabular-nums">{formatUZS(shipping, locale as Locale)}</span>
      </p>
      <p className="text-xs leading-snug text-muted">{t("taxNote")}</p>
      <p className="flex justify-between gap-3 border-t border-night/8 pt-2 text-base font-bold">
        <span>{t("total")}</span>
        <span className="tabular-nums">{formatUZS(grandTotal, locale as Locale)}</span>
      </p>
    </div>
  );

  return (
    <div className="mx-auto max-w-2xl animate-rise pb-[calc(var(--sticky-action-h)+1rem)] lg:pb-0">
      <PageHeader title={t("title")} />
      <p className="mt-2 text-lg font-bold text-night">
        {formatUZS(grandTotal, locale as Locale)}
      </p>

      <ol className="mt-6 flex items-center justify-between gap-1 text-xs sm:gap-2 sm:text-sm" aria-label={t("title")}>
        {steps.map((step, i) => {
          const done = activeStep > step.id;
          const current = activeStep === step.id;
          return (
            <li key={step.id} className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition ${
                  current
                    ? "bg-accent text-night ring-2 ring-accent/30"
                    : done
                      ? "bg-teal text-paper"
                      : "border border-night/12 bg-white text-night/40"
                }`}
                aria-current={current ? "step" : undefined}
              >
                {done ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  step.id
                )}
              </span>
              <span
                className={`hidden truncate font-semibold sm:inline ${
                  current ? "text-night" : done ? "text-teal" : "text-night/45"
                }`}
              >
                {step.label}
              </span>
              <span className={`truncate font-semibold sm:hidden ${current ? "text-night" : "text-night/45"}`}>
                {current ? step.label : ""}
              </span>
              {i < steps.length - 1 ? (
                <span className={`ms-auto hidden h-px min-w-4 flex-1 sm:block ${done ? "bg-teal/40" : "bg-night/10"}`} />
              ) : null}
            </li>
          );
        })}
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
        <div className="mt-3 border-t border-night/8 pt-3">
          {previewLoading ? (
            <div className="space-y-2 animate-pulse">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-4 rounded bg-night/8" />
              ))}
            </div>
          ) : (
            summaryBreakdown
          )}
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
        <section ref={stepContactRef}>
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

        <section ref={stepDeliveryRef}>
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
            {t("shipping")}: {formatUZS(shipping, locale as Locale)}
          </p>
        </section>

        <section ref={stepPaymentRef}>
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
              {formatUZS(grandTotal, locale as Locale)}
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
