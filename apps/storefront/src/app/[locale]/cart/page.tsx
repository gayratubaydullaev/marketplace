"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { formatUZS, type Locale } from "@gayrat/i18n";
import { useCart } from "@/lib/cart";
import { api } from "@/lib/api";
import { EmptyState, PageHeader } from "@/components/PageChrome";
import { MobileStickyPortal } from "@/components/MobileStickyPortal";

type CartTotals = {
  subtotal?: number;
  discount?: number;
  gift?: number;
  total?: number;
};

/** Prefer local line totals when server returns 0 but the UI cart still has priced items. */
function resolveMoney(serverVal: number | undefined, localVal: number) {
  if (typeof serverVal !== "number") return localVal;
  if (serverVal === 0 && localVal > 0) return localVal;
  return serverVal;
}

export default function CartPage() {
  const t = useTranslations("cart");
  const locale = useLocale();
  const { items, setQty, remove, total, syncToServer } = useCart();
  const [coupon, setCoupon] = useState("");
  const [gift, setGift] = useState("");
  const [couponMessage, setCouponMessage] = useState("");
  const [giftMessage, setGiftMessage] = useState("");
  const [server, setServer] = useState<CartTotals>({});
  const [vendorNames, setVendorNames] = useState<Record<string, string>>({});

  const localSubtotal = useMemo(() => total(), [items]);

  async function refreshServer() {
    try {
      await syncToServer();
      const data = await api<CartTotals & { cart?: unknown }>("/v1/cart");
      setServer({
        subtotal: data.subtotal,
        discount: data.discount,
        gift: data.gift,
        total: data.total,
      });
    } catch {
      /* local totals fallback */
    }
  }

  useEffect(() => {
    if (items.length) refreshServer().catch(() => undefined);
    else setServer({});
  }, [items.length]);

  useEffect(() => {
    const ids = [...new Set(items.map((i) => i.vendor_id).filter(Boolean))] as string[];
    if (!ids.length) return;
    api<{ items: { id: string; name: string }[] }>("/v1/vendors")
      .then((d) => {
        const map: Record<string, string> = {};
        for (const v of d.items || []) map[v.id] = v.name;
        setVendorNames(map);
      })
      .catch(() => undefined);
  }, [items]);

  async function applyCoupon() {
    const code = coupon.trim();
    if (!code) {
      setCouponMessage(t("enterCoupon"));
      return;
    }
    setCouponMessage("");
    try {
      await syncToServer();
      await api("/v1/cart/apply-coupon", {
        method: "POST",
        body: JSON.stringify({ code }),
      });
      setCouponMessage(t("couponApplied"));
      await refreshServer();
    } catch (error) {
      const raw = error instanceof Error ? error.message : t("couponError");
      setCouponMessage(raw.length > 160 ? t("couponError") : raw);
    }
  }

  async function applyGift() {
    const code = gift.trim();
    if (!code) {
      setGiftMessage(t("enterGift"));
      return;
    }
    setGiftMessage("");
    try {
      await syncToServer();
      await api("/v1/cart/apply-gift", {
        method: "POST",
        body: JSON.stringify({ code }),
      });
      setGiftMessage(t("giftApplied"));
      await refreshServer();
    } catch (error) {
      const raw = error instanceof Error ? error.message : t("giftError");
      setGiftMessage(raw.length > 160 ? t("giftError") : raw);
    }
  }

  async function removeGift() {
    try {
      await api("/v1/cart/gift", { method: "DELETE" });
      setGift("");
      setGiftMessage(t("giftRemoved"));
      await refreshServer();
    } catch {
      setGiftMessage(t("giftError"));
    }
  }

  if (items.length === 0) {
    return (
      <div className="animate-rise py-6">
        <PageHeader title={t("title")} />
        <div className="mt-8">
          <EmptyState
            title={t("empty")}
            description={t("emptyHint")}
            actionHref={`/${locale}/products`}
            actionLabel={t("browse")}
          />
        </div>
      </div>
    );
  }

  const vendorGroups = items.reduce<Record<string, typeof items>>((groups, item) => {
    const vendor =
      item.vendor_name ||
      (item.vendor_id && vendorNames[item.vendor_id]) ||
      item.vendor_id ||
      "Marketplace";
    (groups[vendor] ||= []).push(item);
    return groups;
  }, {});

  const subtotal = resolveMoney(server.subtotal, localSubtotal);
  const discount = server.discount ?? 0;
  const giftAmt = server.gift ?? 0;
  const merchandise = resolveMoney(server.total, Math.max(0, subtotal - discount - giftAmt));
  const canCheckout = subtotal > 0;
  const count = items.reduce((a, i) => a + i.quantity, 0);

  const summaryBlock = (
    <div className="space-y-2 text-sm">
      <div className="flex justify-between gap-3">
        <span className="text-muted">{t("subtotal")}</span>
        <span className="font-medium tabular-nums">{formatUZS(subtotal, locale as Locale)}</span>
      </div>
      {discount > 0 && (
        <div className="flex justify-between gap-3 text-danger">
          <span>{t("discount")}</span>
          <span className="tabular-nums">−{formatUZS(discount, locale as Locale)}</span>
        </div>
      )}
      {giftAmt > 0 && (
        <div className="flex justify-between gap-3 text-danger">
          <span>{t("gift")}</span>
          <span className="tabular-nums">−{formatUZS(giftAmt, locale as Locale)}</span>
        </div>
      )}
      <div className="flex justify-between gap-3 border-t border-night/8 pt-3 text-base">
        <span className="font-bold">{t("total")}</span>
        <span className="font-bold tabular-nums">{formatUZS(merchandise, locale as Locale)}</span>
      </div>
      <p className="pt-1 text-xs text-muted">{t("shippingAtCheckout")}</p>
      {!canCheckout ? <p className="text-xs text-muted">{t("cannotCheckout")}</p> : null}
    </div>
  );

  const checkoutCta = canCheckout ? (
    <Link
      href={`/${locale}/checkout`}
      className="flex w-full items-center justify-center rounded-xl bg-accent py-3.5 text-sm font-bold text-night transition hover:bg-accent-hover"
    >
      {t("checkout")}
    </Link>
  ) : (
    <button
      type="button"
      disabled
      className="flex w-full cursor-not-allowed items-center justify-center rounded-xl bg-night/10 py-3.5 text-sm font-bold text-muted"
    >
      {t("checkout")}
    </button>
  );

  return (
    <div className="animate-rise pb-[calc(var(--sticky-action-h)+1rem)] md:pb-0">
      <PageHeader title={t("title")} subtitle={t("itemsCount", { count })} />

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-8">
          {Object.entries(vendorGroups).map(([vendorLabel, vendorItems]) => (
            <section key={vendorLabel}>
              {vendorLabel !== "Marketplace" && (
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
                  {t("vendor")}: {vendorLabel}
                </p>
              )}
              <ul className="divide-y divide-night/8 border-y border-night/8">
                {vendorItems.map((item) => (
                  <li
                    key={`${item.product_id}:${item.variant_id || ""}`}
                    className="flex flex-wrap items-center gap-3 py-4 sm:gap-4 sm:flex-nowrap"
                  >
                    <Link href={`/${locale}/products/${item.slug}`} className="shrink-0">
                      <div className="h-20 w-20 overflow-hidden rounded-xl bg-surface-muted sm:h-24 sm:w-24">
                        {item.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.image} alt="" className="h-full w-full object-cover" />
                        ) : null}
                      </div>
                    </Link>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/${locale}/products/${item.slug}`}
                        className="line-clamp-2 text-sm font-semibold text-night hover:text-teal"
                      >
                        {item.title}
                      </Link>
                      <p className="mt-1 text-sm font-bold text-night">
                        {formatUZS(item.unit_price, locale as Locale)}
                      </p>
                      <button
                        type="button"
                        className="mt-2 min-h-9 text-xs font-medium text-muted hover:text-danger"
                        onClick={() => remove(item.product_id, item.variant_id)}
                      >
                        {t("remove")}
                      </button>
                    </div>
                    <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:flex-col sm:items-end">
                      <div className="inline-flex items-center rounded-xl border border-night/12">
                        <button
                          type="button"
                          className="flex h-11 w-11 items-center justify-center text-night/70 hover:bg-night/4"
                          aria-label="decrease"
                          onClick={() => setQty(item.product_id, item.quantity - 1, item.variant_id)}
                        >
                          −
                        </button>
                        <span className="min-w-8 text-center text-sm font-bold tabular-nums">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          className="flex h-11 w-11 items-center justify-center text-night/70 hover:bg-night/4"
                          aria-label="increase"
                          onClick={() => setQty(item.product_id, item.quantity + 1, item.variant_id)}
                        >
                          +
                        </button>
                      </div>
                      <p className="text-sm font-bold text-night tabular-nums">
                        {formatUZS(item.unit_price * item.quantity, locale as Locale)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="flex gap-2">
                <input
                  className="min-w-0 flex-1 rounded-xl border border-night/10 bg-surface-muted px-3 py-2.5 text-sm outline-none focus:border-accent/40 focus:bg-white"
                  placeholder={t("coupon")}
                  value={coupon}
                  onChange={(event) => setCoupon(event.target.value)}
                />
                <button
                  type="button"
                  onClick={applyCoupon}
                  disabled={!coupon.trim() || !canCheckout}
                  className="min-h-11 rounded-xl border border-accent px-4 py-2 text-sm font-bold text-teal disabled:opacity-50"
                >
                  {t("applyCoupon")}
                </button>
              </div>
              {couponMessage ? <p className="mt-2 text-xs text-muted">{couponMessage}</p> : null}
            </div>
            <div>
              <div className="flex gap-2">
                <input
                  className="min-w-0 flex-1 rounded-xl border border-night/10 bg-surface-muted px-3 py-2.5 text-sm outline-none focus:border-accent/40 focus:bg-white"
                  placeholder={t("gift")}
                  value={gift}
                  onChange={(event) => setGift(event.target.value)}
                />
                <button
                  type="button"
                  onClick={applyGift}
                  disabled={!gift.trim() || !canCheckout}
                  className="min-h-11 rounded-xl border border-accent px-4 py-2 text-sm font-bold text-teal disabled:opacity-50"
                >
                  {t("applyGift")}
                </button>
                <button
                  type="button"
                  onClick={removeGift}
                  className="min-h-11 rounded-xl border border-night/12 px-3 text-sm text-muted"
                  aria-label={t("remove")}
                >
                  ×
                </button>
              </div>
              {giftMessage ? <p className="mt-2 text-xs text-muted">{giftMessage}</p> : null}
            </div>
          </div>
        </div>

        <aside className="hidden h-fit lg:sticky lg:top-24 lg:block">
          <h2 className="font-display text-base font-bold text-night">{t("summary")}</h2>
          <div className="mt-4">{summaryBlock}</div>
          <div className="mt-5">{checkoutCta}</div>
        </aside>
      </div>

      <div className="mt-8 lg:hidden">
        <div className="rounded-2xl border border-night/8 bg-surface-muted/40 p-4">{summaryBlock}</div>
      </div>

      <MobileStickyPortal>
        <div className="flex w-full items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium text-muted">{t("total")}</p>
            <p className="truncate text-base font-bold text-night tabular-nums">
              {formatUZS(merchandise, locale as Locale)}
            </p>
          </div>
          {canCheckout ? (
            <Link
              href={`/${locale}/checkout`}
              className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-accent px-5 text-sm font-bold text-night"
            >
              {t("checkout")}
            </Link>
          ) : (
            <button
              type="button"
              disabled
              className="inline-flex min-h-11 shrink-0 cursor-not-allowed items-center justify-center rounded-xl bg-night/10 px-5 text-sm font-bold text-muted"
            >
              {t("checkout")}
            </button>
          )}
        </div>
      </MobileStickyPortal>
    </div>
  );
}
