"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { formatUZS, type Locale } from "@gayrat/i18n";
import { api, productImage, type Product } from "@/lib/api";
import { PageHeader, StatusBadge } from "@/components/PageChrome";

type OrderItem = {
  id?: string;
  product_id: string;
  title: string;
  quantity: number;
  unit_price: number;
  total_price?: number;
};

type OrderPayload = {
  order?: {
    order_number: string;
    status: string;
    payment_status?: string;
    total: number;
    subtotal?: number;
    shipping_cost?: number;
    discount?: number;
    shipping_address?: Record<string, string>;
    created_at?: string;
  };
  items?: OrderItem[];
};

type Tracking = {
  carrier?: string;
  tracking_number?: string;
  status?: string;
};

type ProductMeta = {
  slug?: string;
  image?: string;
};

const TIMELINE = ["pending", "confirmed", "processing", "shipped", "delivered", "completed"] as const;

function userIdFromToken(): string | null {
  if (typeof window === "undefined") return null;
  const token = localStorage.getItem("access_token");
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1] || ""));
    return payload.sub || payload.user_id || null;
  } catch {
    return null;
  }
}

function statusLabel(t: ReturnType<typeof useTranslations>, status: string) {
  const map: Record<string, string> = {
    pending: "statusPending",
    confirmed: "statusConfirmed",
    processing: "statusProcessing",
    shipped: "statusShipped",
    delivered: "statusDelivered",
    completed: "statusCompleted",
    cancelled: "statusCancelled",
  };
  const key = map[status];
  return key ? t(key as "statusPending") : status;
}

function paymentLabel(t: ReturnType<typeof useTranslations>, status?: string) {
  if (!status) return "";
  const map: Record<string, string> = {
    paid: "paymentPaid",
    unpaid: "paymentUnpaid",
    pending: "paymentPending",
    failed: "paymentFailed",
    refunded: "paymentRefunded",
  };
  const key = map[status];
  return key ? t(key as "paymentPaid") : status;
}

function trackStatusLabel(t: ReturnType<typeof useTranslations>, status?: string) {
  if (!status) return "";
  const map: Record<string, string> = {
    in_transit: "trackInTransit",
    delivered: "trackDelivered",
    pending: "trackPending",
    created: "trackCreated",
  };
  const key = map[status];
  return key ? t(key as "trackInTransit") : status;
}

export default function OrderDetailPage() {
  const params = useParams();
  const locale = useLocale();
  const t = useTranslations("orders");
  const id = String(params.id || "");
  const [data, setData] = useState<OrderPayload>({});
  const [tracking, setTracking] = useState<Tracking | null>(null);
  const [productMeta, setProductMeta] = useState<Record<string, ProductMeta>>({});
  const [live, setLive] = useState(false);
  const [cancelMsg, setCancelMsg] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    const load = () =>
      api<OrderPayload>(`/v1/orders/${id}`)
        .then((d) => {
          if (!cancelled) {
            setData(d);
            setError("");
            setLoading(false);
          }
        })
        .catch((e) => {
          if (!cancelled) {
            setError(e instanceof Error ? e.message : t("loadError"));
            setLoading(false);
          }
        });

    load();
    api<Tracking>(`/v1/orders/${id}/tracking`)
      .then((d) => !cancelled && setTracking(d))
      .catch(() => undefined);
    const poll = setInterval(load, 5000);

    let ws: WebSocket | null = null;
    const wsBase = process.env.NEXT_PUBLIC_WS_URL;
    if (wsBase) {
      (async () => {
        try {
          const tok = await api<{ token: string; url: string }>("/v1/realtime/token", {
            method: "POST",
            body: "{}",
          });
          const userID = userIdFromToken();
          if (!userID) return;
          const url = tok.url || `${wsBase.replace(/\/$/, "")}/connection/websocket`;
          ws = new WebSocket(url);
          ws.onopen = () => {
            ws?.send(JSON.stringify({ id: 1, connect: { token: tok.token } }));
            ws?.send(JSON.stringify({ id: 2, subscribe: { channel: `orders:#${userID}` } }));
            setLive(true);
          };
          ws.onmessage = (ev) => {
            try {
              const msg = JSON.parse(String(ev.data));
              const pub = msg.push?.pub || msg.pub;
              if (pub?.data) {
                setData((prev) => ({
                  ...prev,
                  order: prev.order
                    ? {
                        ...prev.order,
                        status: pub.data.status || prev.order.status,
                        payment_status: pub.data.payment_status || prev.order.payment_status,
                      }
                    : prev.order,
                }));
                load();
              }
            } catch {
              /* ignore */
            }
          };
          ws.onerror = () => setLive(false);
        } catch {
          setLive(false);
        }
      })();
    }

    return () => {
      cancelled = true;
      clearInterval(poll);
      ws?.close();
    };
  }, [id, t]);

  const productIds = useMemo(
    () => [...new Set((data.items || []).map((it) => it.product_id).filter(Boolean))],
    [data.items]
  );

  useEffect(() => {
    if (productIds.length === 0) return;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        productIds.map(async (pid) => {
          try {
            const res = await api<{ product: Product }>(`/v1/products/by-id/${pid}`);
            return [
              pid,
              {
                slug: res.product?.slug,
                image: res.product ? productImage(res.product) : undefined,
              } satisfies ProductMeta,
            ] as const;
          } catch {
            return [pid, {} as ProductMeta] as const;
          }
        })
      );
      if (!cancelled) {
        setProductMeta(Object.fromEntries(entries));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [productIds]);

  async function cancelOrder() {
    setCancelMsg("");
    try {
      await api(`/v1/orders/${id}/cancel`, { method: "POST", body: "{}" });
      setCancelMsg(t("cancelled"));
      const d = await api<OrderPayload>(`/v1/orders/${id}`);
      setData(d);
    } catch (err) {
      setCancelMsg(err instanceof Error ? err.message : t("cancelError"));
    }
  }

  if (loading && !data.order) {
    return (
      <div className="mx-auto max-w-2xl animate-rise space-y-4">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-night/8" />
        <div className="h-40 animate-pulse rounded-3xl bg-night/5" />
        <div className="h-28 animate-pulse rounded-3xl bg-night/5" />
      </div>
    );
  }

  if (error && !data.order) {
    return (
      <div className="mx-auto max-w-2xl animate-rise py-12 text-center">
        <p className="text-night/70">{t("loadError")}</p>
        <p className="mt-2 text-xs break-all text-night/40">{error}</p>
        <Link
          href={`/${locale}/orders`}
          className="mt-6 inline-block rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-night"
        >
          {t("title")}
        </Link>
      </div>
    );
  }

  const o = data.order;
  if (!o) return <p className="animate-rise">{t("loading")}</p>;

  const items = data.items || [];
  const statusIdx = TIMELINE.indexOf(o.status as (typeof TIMELINE)[number]);
  const canCancel = ["pending", "confirmed"].includes(o.status);
  const addr = o.shipping_address || {};
  const payLabel = paymentLabel(t, o.payment_status);

  return (
    <div className="mx-auto max-w-2xl animate-rise pb-[calc(var(--bottom-nav-h,0px)+1.5rem)] md:pb-0">
      <Link href={`/${locale}/orders`} className="text-sm font-medium text-muted hover:text-teal">
        ← {t("title")}
      </Link>

      <div className="mt-4">
        <PageHeader
          title={o.order_number}
          subtitle={
            o.created_at
              ? new Date(o.created_at).toLocaleString(locale, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })
              : undefined
          }
          actions={
            <p className="text-xl font-bold tabular-nums text-night sm:text-2xl">
              {formatUZS(o.total, locale as Locale)}
            </p>
          }
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge status={o.status} label={statusLabel(t, o.status)} />
          {payLabel ? <StatusBadge status={o.payment_status || "paid"} label={payLabel} /> : null}
          {live ? <span className="text-xs text-muted">({t("live")})</span> : null}
        </div>
      </div>

      <section className="mt-8 rounded-3xl border border-night/8 bg-white p-5 sm:p-6">
        <h2 className="text-xs font-bold uppercase tracking-wide text-muted">{t("items")}</h2>
        {items.length === 0 ? (
          <p className="mt-4 text-sm text-muted">{t("noItems")}</p>
        ) : (
          <ul className="mt-4 divide-y divide-night/8">
            {items.map((it, i) => {
              const meta = productMeta[it.product_id] || {};
              const lineTotal =
                typeof it.total_price === "number" ? it.total_price : it.unit_price * it.quantity;
              const body = (
                <>
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-surface-muted sm:h-[4.5rem] sm:w-[4.5rem]">
                    {meta.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={meta.image} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-end p-2 text-lg font-bold text-night/15">
                        {(it.title || "?").slice(0, 1)}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-night">{it.title}</p>
                    <p className="mt-1 text-sm text-muted">
                      {it.quantity} × {formatUZS(it.unit_price, locale as Locale)}
                    </p>
                    {meta.slug ? (
                      <p className="mt-1 text-xs font-semibold text-teal">{t("viewProduct")}</p>
                    ) : null}
                  </div>
                  <p className="shrink-0 self-start text-sm font-bold tabular-nums text-night">
                    {formatUZS(lineTotal, locale as Locale)}
                  </p>
                </>
              );

              return (
                <li key={it.id || `${it.product_id}-${i}`} className="py-4 first:pt-0 last:pb-0">
                  {meta.slug ? (
                    <Link
                      href={`/${locale}/products/${meta.slug}`}
                      className="flex items-start gap-3 transition hover:opacity-90"
                    >
                      {body}
                    </Link>
                  ) : (
                    <div className="flex items-start gap-3">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <dl className="mt-5 space-y-2 border-t border-night/8 pt-4 text-sm">
          {typeof o.subtotal === "number" ? (
            <div className="flex justify-between gap-3">
              <dt className="text-muted">{t("subtotal")}</dt>
              <dd className="font-medium tabular-nums">{formatUZS(o.subtotal, locale as Locale)}</dd>
            </div>
          ) : null}
          {typeof o.shipping_cost === "number" && o.shipping_cost > 0 ? (
            <div className="flex justify-between gap-3">
              <dt className="text-muted">{t("shipping")}</dt>
              <dd className="font-medium tabular-nums">
                {formatUZS(o.shipping_cost, locale as Locale)}
              </dd>
            </div>
          ) : null}
          {typeof o.discount === "number" && o.discount > 0 ? (
            <div className="flex justify-between gap-3">
              <dt className="text-muted">{t("discount")}</dt>
              <dd className="font-medium tabular-nums text-teal">
                −{formatUZS(o.discount, locale as Locale)}
              </dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-3 pt-1 text-base">
            <dt className="font-bold text-night">{t("total")}</dt>
            <dd className="font-bold tabular-nums text-night">
              {formatUZS(o.total, locale as Locale)}
            </dd>
          </div>
        </dl>
      </section>

      <section className="mt-4 rounded-3xl border border-night/8 bg-white p-5 sm:p-6">
        <h2 className="text-xs font-bold uppercase tracking-wide text-muted">{t("timeline")}</h2>
        <ol className="mt-4 flex flex-wrap gap-2">
          {TIMELINE.map((step, i) => {
            const done = statusIdx >= 0 && i <= statusIdx;
            const current = o.status === step;
            return (
              <li
                key={step}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  current
                    ? "bg-accent text-night"
                    : done
                      ? "bg-accent/15 text-teal"
                      : "bg-night/5 text-night/40"
                }`}
              >
                {statusLabel(t, step)}
              </li>
            );
          })}
          {o.status === "cancelled" && (
            <li className="rounded-full bg-rose-100 px-3 py-1.5 text-xs font-semibold text-rose-700">
              {statusLabel(t, "cancelled")}
            </li>
          )}
        </ol>
      </section>

      {Object.keys(addr).length > 0 ? (
        <section className="mt-4 rounded-3xl border border-night/8 bg-white p-5 sm:p-6">
          <h2 className="text-xs font-bold uppercase tracking-wide text-muted">{t("address")}</h2>
          <p className="mt-2 text-sm leading-relaxed text-night/80">
            {[addr.region, addr.district, addr.street || addr.address_line1, addr.phone]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </section>
      ) : null}

      {tracking ? (
        <section className="mt-4 rounded-3xl border border-night/8 bg-white p-5 sm:p-6">
          <h2 className="text-xs font-bold uppercase tracking-wide text-muted">{t("track")}</h2>
          <p className="mt-2 text-sm font-semibold text-night">
            {[tracking.carrier, tracking.tracking_number].filter(Boolean).join(" · ")}
          </p>
          {tracking.status ? (
            <p className="mt-1 text-sm text-teal">{trackStatusLabel(t, tracking.status)}</p>
          ) : null}
        </section>
      ) : null}

      {canCancel ? (
        <button
          type="button"
          onClick={cancelOrder}
          className="mt-6 w-full rounded-xl border border-rose-300 px-5 py-3 text-sm font-bold text-rose-700 transition hover:bg-rose-50 sm:w-auto"
        >
          {t("cancel")}
        </button>
      ) : null}
      {cancelMsg ? <p className="mt-2 text-sm break-all text-muted">{cancelMsg}</p> : null}
    </div>
  );
}
