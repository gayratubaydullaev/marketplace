"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@gayrat/ui";
import { api, errMsg } from "@/lib/api";
import { Msg, PageHeader, StatusBadge } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { usePoll } from "@/hooks/usePoll";
import { deliveryStatusLabel } from "@/lib/status";

const RouteMap = dynamic(() => import("@gayrat/map").then((m) => m.RouteMap), {
  ssr: false,
  loading: () => <div className="gayrat-map-skeleton h-[280px] rounded-xl" />,
});
const TrackingMap = dynamic(() => import("@gayrat/map").then((m) => m.TrackingMap), {
  ssr: false,
  loading: () => <div className="gayrat-map-skeleton h-[280px] rounded-xl" />,
});

type OrderPayload = {
  order?: {
    id: string;
    order_number: string;
    status: string;
    payment_status?: string;
    payment_method?: string;
    guest_email?: string | null;
    subtotal?: number;
    discount?: number;
    shipping_cost?: number;
    total: number;
    notes?: string | null;
    created_at?: string;
    shipping_address?: Record<string, string | undefined>;
  };
  items?: { title: string; quantity: number; unit_price: number; total_price?: number; vendor_id?: string }[];
};

type Tracking = { carrier?: string; tracking_number?: string; status?: string };

type DeliveryJob = {
  id: string;
  status: string;
  courier_name?: string;
  courier_phone?: string;
  assigned_at?: string;
  pickup_lat?: number | null;
  pickup_lng?: number | null;
  dropoff_lat?: number | null;
  dropoff_lng?: number | null;
  pickup_address?: string;
  dropoff_address?: string;
};

const TIMELINE = ["pending", "confirmed", "processing", "shipped", "delivered", "completed"] as const;
const COD_METHODS = new Set(["cash_on_delivery", "card_on_delivery", "bank_transfer"]);

function nextStatuses(current: string, isCourierDelivery: boolean): string[] {
  switch (current) {
    case "pending":
      return ["confirmed", "cancelled"];
    case "confirmed":
      return ["processing", "cancelled"];
    case "processing":
      return isCourierDelivery ? ["returned"] : ["shipped", "returned"];
    case "shipped":
      return isCourierDelivery ? [] : ["delivered"];
    case "delivered":
      return ["completed"];
    default:
      return [];
  }
}

function statusKey(status: string): string {
  const map: Record<string, string> = {
    pending: "statusPending",
    confirmed: "statusConfirmed",
    processing: "statusProcessing",
    shipped: "statusShipped",
    delivered: "statusDelivered",
    completed: "statusCompleted",
    cancelled: "statusCancelled",
    returned: "statusReturned",
  };
  return map[status] || "";
}

function paymentStatusKey(status: string): string {
  const map: Record<string, string> = { unpaid: "payUnpaid", paid: "payPaid", refunded: "payRefunded" };
  return map[status] || "";
}

function paymentMethodKey(method: string): string {
  const map: Record<string, string> = {
    cash_on_delivery: "payCashOnDelivery",
    card_on_delivery: "payCardOnDelivery",
    bank_transfer: "payBankTransfer",
  };
  return map[method] || "";
}

function money(n: number | undefined, locale: string) {
  return `${(n ?? 0).toLocaleString(locale)} UZS`;
}

export default function OrderDetailPage() {
  const params = useParams();
  const id = String(params.id || "");
  const { t, locale } = useI18n();
  const numberLocale = locale === "uz" ? "uz-UZ" : locale === "ru" ? "ru-RU" : locale === "ar" ? "ar" : "en";
  const [data, setData] = useState<OrderPayload>({});
  const [tracking, setTracking] = useState<Tracking | null>(null);
  const [delivery, setDeliveryJob] = useState<DeliveryJob | null>(null);
  const [chat, setChat] = useState<{ id: string; sender_role: string; to_role?: string; body: string }[]>([]);
  const [chatBody, setChatBody] = useState("");
  const [chatTo, setChatTo] = useState("courier");
  const [chatBusy, setChatBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState("");
  const [liveCourier, setLiveCourier] = useState<{ lat: number; lng: number; updated_at?: string } | null>(null);

  function labelStatus(status?: string) {
    if (!status) return "—";
    const key = statusKey(status);
    return key ? t(key) : status;
  }
  function labelPayStatus(status?: string) {
    if (!status) return "—";
    const key = paymentStatusKey(status);
    return key ? t(key) : status;
  }
  function labelPayMethod(method?: string) {
    if (!method) return "";
    const key = paymentMethodKey(method);
    return key ? t(key) : method;
  }

  async function load() {
    const d = await api<OrderPayload>(`/v1/orders/${id}`);
    setData(d);
    api<Tracking & { available?: boolean }>(`/v1/orders/${id}/tracking`)
      .then((result) => {
        if (!result?.carrier && !result?.tracking_number) setTracking(null);
        else setTracking(result);
      })
      .catch(() => setTracking(null));
    api<DeliveryJob>(`/v1/delivery/orders/${id}`)
      .then((job) => {
        setDeliveryJob(job);
        return api<{ items: { id: string; sender_role: string; body: string; to_role?: string }[] }>(
          `/v1/delivery/orders/${id}/messages`
        )
          .then((m) => setChat(m.items || []))
          .catch(() => setChat([]));
      })
      .catch(() => {
        setDeliveryJob(null);
        setChat([]);
      });
  }

  const softLoad = useCallback(() => {
    if (!id) return;
    return load().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!id) return;
    setMsg("");
    setData({});
    load().catch((e) => setMsg(errMsg(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const deliveryActive =
    !!delivery && !["delivered", "cancelled"].includes(delivery.status);

  usePoll(() => softLoad(), 15_000, deliveryActive);

  useEffect(() => {
    if (!id || !delivery) return;
    const active = ["assigned", "accepted", "at_pickup", "picked_up", "in_transit"].includes(delivery.status);
    if (!active) {
      setLiveCourier(null);
      return;
    }
    const pull = () =>
      api<{ courier?: { lat: number; lng: number; updated_at?: string } | null }>(`/v1/delivery/orders/${id}/live`)
        .then((d) => setLiveCourier(d.courier || null))
        .catch(() => setLiveCourier(null));
    pull();
    const tmr = window.setInterval(pull, 8000);
    return () => window.clearInterval(tmr);
  }, [id, delivery]);

  const mapStops = useMemo(() => {
    if (!delivery) return [];
    const stops: { id: string; lat: number; lng: number; label?: string; kind: "pickup" | "dropoff" }[] = [];
    if (delivery.pickup_lat != null && delivery.pickup_lng != null) {
      stops.push({
        id: "pickup",
        lat: delivery.pickup_lat,
        lng: delivery.pickup_lng,
        label: delivery.pickup_address || t("orderMapPickup"),
        kind: "pickup",
      });
    }
    if (delivery.dropoff_lat != null && delivery.dropoff_lng != null) {
      stops.push({
        id: "dropoff",
        lat: delivery.dropoff_lat,
        lng: delivery.dropoff_lng,
        label: delivery.dropoff_address || t("orderMapDropoff"),
        kind: "dropoff",
      });
    }
    return stops;
  }, [delivery, t]);

  async function setStatus(status: string) {
    setMsg("");
    setOk("");
    await api(`/v1/orders/${id}/status`, { method: "POST", body: JSON.stringify({ status }) });
    setOk(t("orderStatusChanged", { status: labelStatus(status) }));
    await load();
  }

  async function collectPayment() {
    setMsg("");
    setOk("");
    await api(`/v1/payments/collect`, { method: "POST", body: JSON.stringify({ order_id: id }) });
    setOk(t("orderCollectOk"));
    await load();
  }

  async function readyForDelivery() {
    setMsg("");
    setOk("");
    await api(`/v1/orders/${id}/ready-for-delivery`, { method: "POST", body: "{}" });
    setOk(t("orderReadyOk"));
    await load();
  }

  async function sendDeliveryChat() {
    if (!chatBody.trim() || chatBusy) return;
    setChatBusy(true);
    try {
      await api(`/v1/delivery/orders/${id}/messages`, {
        method: "POST",
        body: JSON.stringify({ body: chatBody.trim(), to_role: chatTo }),
      });
      setChatBody("");
      const m = await api<{ items: { id: string; sender_role: string; to_role?: string; body: string }[] }>(
        `/v1/delivery/orders/${id}/messages`
      );
      setChat(m.items || []);
    } catch (e) {
      setMsg(errMsg(e));
    } finally {
      setChatBusy(false);
    }
  }

  const o = data.order;
  if (!o && !msg) return <p className="text-sm text-slate-500">{t("commonLoading")}</p>;
  if (!o) {
    return (
      <div>
        <PageHeader
          title={t("orderNotFound")}
          description={id}
          actions={
            <Link href="/orders" className="text-sm text-teal hover:underline">
              ← {t("orderBack")}
            </Link>
          }
        />
        <Msg text={msg || t("orderNotFoundHint")} />
      </div>
    );
  }

  const idx = TIMELINE.indexOf(o.status as (typeof TIMELINE)[number]);
  const addr = o.shipping_address || {};
  const street = addr.address_line1 || addr.street || addr.building || "";
  const isCourierDelivery = addr.delivery_method === "courier" || !addr.delivery_method;
  const deliveryLabel =
    addr.delivery_method === "pickup"
      ? t("deliveryPickup")
      : addr.delivery_method === "courier"
        ? t("deliveryCourier")
        : addr.delivery_method || "";
  const actions = nextStatuses(o.status, isCourierDelivery && addr.delivery_method !== "pickup");
  const unpaidCOD = o.payment_status !== "paid" && COD_METHODS.has(o.payment_method || "");
  const needsPayBeforeHandoff = unpaidCOD && (o.status === "shipped" || actions.includes("delivered"));
  const canReady =
    isCourierDelivery &&
    addr.delivery_method !== "pickup" &&
    o.status === "processing" &&
    (!delivery || delivery.status === "cancelled");

  return (
    <div>
      <PageHeader
        title={o.order_number || o.id.slice(0, 8)}
        description={`${t("orderTotal")}: ${money(o.total, numberLocale)}`}
        actions={
          <Link href="/orders" className="text-sm text-teal hover:underline">
            ← {t("orderBack")}
          </Link>
        }
      />
      <Msg text={msg} />
      <Msg text={ok} tone="ok" />

      <div className="flex flex-wrap gap-2">
        <StatusBadge status={o.status} label={labelStatus(o.status)} />
        <StatusBadge status={o.payment_status} label={labelPayStatus(o.payment_status)} />
        {o.payment_method ? <StatusBadge status={o.payment_method} label={labelPayMethod(o.payment_method)} /> : null}
      </div>

      {unpaidCOD && (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{t("orderPaymentHint")}</p>
      )}

      <section className="mt-6">
        <h2 className="font-semibold">{t("orderTimeline")}</h2>
        <ol className="mt-3 flex flex-wrap gap-2">
          {TIMELINE.map((step, i) => (
            <li
              key={step}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                o.status === step ? "bg-teal text-white" : idx >= i ? "bg-teal/15 text-teal" : "bg-slate-100 text-slate-400"
              }`}
            >
              {labelStatus(step)}
            </li>
          ))}
        </ol>
      </section>

      {(actions.length > 0 || unpaidCOD || canReady) && (
        <section className="mt-6">
          <h2 className="font-semibold">{t("orderActions")}</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {unpaidCOD && (
              <Button variant="primary" className="!px-3 !py-1.5 text-xs" onClick={() => collectPayment().catch((e) => setMsg(errMsg(e)))}>
                {t("orderCollectPay")}
              </Button>
            )}
            {canReady && (
              <Button variant="primary" className="!px-3 !py-1.5 text-xs" onClick={() => readyForDelivery().catch((e) => setMsg(errMsg(e)))}>
                {t("orderReadyForDelivery")}
              </Button>
            )}
            {actions.map((s) => {
              const blocked = (s === "delivered" || s === "completed") && o.payment_status !== "paid";
              return (
                <Button
                  key={s}
                  variant={s === "cancelled" || s === "returned" ? "secondary" : "primary"}
                  className="!px-3 !py-1.5 text-xs"
                  disabled={blocked}
                  title={blocked ? t("orderPayBeforeDeliver") : undefined}
                  onClick={() => setStatus(s).catch((e) => setMsg(errMsg(e)))}
                >
                  {labelStatus(s)}
                </Button>
              );
            })}
          </div>
          {needsPayBeforeHandoff && <p className="mt-2 text-xs text-amber-700">{t("orderPayBeforeDeliver")}</p>}
        </section>
      )}

      {delivery ? (
        <section className="mt-6 rounded-xl border border-teal/20 bg-teal/5 p-4">
          <h2 className="font-semibold">{t("orderDeliveryStatus")}</h2>
          {mapStops.length > 0 || liveCourier ? (
            <div className="mt-3 overflow-hidden rounded-xl border bg-white shadow-sm">
              <p className="border-b px-3 py-2 text-xs font-semibold text-slate-500">{t("orderMap")}</p>
              {liveCourier && delivery.dropoff_lat != null && delivery.dropoff_lng != null ? (
                <TrackingMap
                  height={280}
                  showRoute
                  courier={{ lat: liveCourier.lat, lng: liveCourier.lng }}
                  dropoff={{ lat: delivery.dropoff_lat, lng: delivery.dropoff_lng }}
                />
              ) : (
                <RouteMap
                  stops={mapStops}
                  self={liveCourier ? { lat: liveCourier.lat, lng: liveCourier.lng } : null}
                  height={280}
                  showRoute
                  legend={[
                    { color: "#0d7377", label: t("orderMapPickup") },
                    { color: "#e8a838", label: t("orderMapDropoff") },
                    ...(liveCourier ? [{ color: "#2563eb", label: t("orderCourier") }] : []),
                  ]}
                />
              )}
            </div>
          ) : (
            <p className="mt-3 rounded-xl border border-dashed bg-white px-3 py-6 text-center text-xs text-slate-500">
              {t("orderMapNoCoords")}
            </p>
          )}
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">{t("commonStatus")}</dt>
              <dd>
                <StatusBadge status={delivery.status} label={deliveryStatusLabel(t, delivery.status)} />
              </dd>
            </div>
            {delivery.courier_name ? (
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">{t("orderCourier")}</dt>
                <dd className="font-medium">
                  {delivery.courier_name}
                  {delivery.courier_phone ? ` · ${delivery.courier_phone}` : ""}
                </dd>
              </div>
            ) : (
              <p className="text-xs text-amber-700">{t("orderAwaitingCourier")}</p>
            )}
          </dl>
          <div className="mt-4 border-t border-teal/20 pt-3">
            <h3 className="text-sm font-semibold">{t("orderDeliveryChat")}</h3>
            <p className="mt-0.5 text-[11px] text-slate-500">{t("orderDeliveryChatHint")}</p>
            <ul className="mt-2 max-h-40 space-y-1.5 overflow-y-auto text-sm">
              {chat.length === 0 ? <li className="text-xs text-slate-400">—</li> : null}
              {chat.map((m) => {
                const roleKey = (r: string) => {
                  const k = `chatRole_${r === "admin" || r === "manager" || r === "super_admin" ? "tenant_admin" : r}`;
                  const label = t(k);
                  return label !== k ? label : r;
                };
                return (
                  <li key={m.id} className="rounded-lg bg-white/80 px-2.5 py-1.5">
                    <span className="text-[10px] font-bold uppercase text-slate-400">
                      {roleKey(m.sender_role)}
                      {" → "}
                      {m.to_role && m.to_role !== "all" ? roleKey(m.to_role) : t("chatRole_all")}
                    </span>
                    <p>{m.body}</p>
                  </li>
                );
              })}
            </ul>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(
                [
                  ["courier", "chatRole_courier"],
                  ["tenant_admin", "chatRole_tenant_admin"],
                ] as const
              ).map(([v, key]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setChatTo(v)}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    chatTo === v ? "bg-teal text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"
                  }`}
                >
                  {t(key)}
                </button>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <input
                className="flex-1 rounded-lg border px-2.5 py-1.5 text-sm"
                value={chatBody}
                onChange={(e) => setChatBody(e.target.value)}
                placeholder={t("orderDeliveryChatPlaceholder")}
                onKeyDown={(e) => e.key === "Enter" && sendDeliveryChat()}
              />
              <Button variant="primary" className="!px-3 !py-1.5 text-xs" disabled={chatBusy} onClick={() => sendDeliveryChat()}>
                {t("orderDeliveryChatSend")}
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <section className="rounded-xl border bg-white p-4">
          <h2 className="font-semibold">{t("orderCustomer")}</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">{t("orderEmail")}</dt>
              <dd className="text-end font-medium">{o.guest_email || "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">{t("orderPhone")}</dt>
              <dd className="text-end font-medium">{addr.phone || "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">{t("orderCreated")}</dt>
              <dd className="text-end font-medium">
                {o.created_at ? new Date(o.created_at).toLocaleString(numberLocale) : "—"}
              </dd>
            </div>
            {o.notes ? (
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">{t("orderNotes")}</dt>
                <dd className="text-end font-medium">{o.notes}</dd>
              </div>
            ) : null}
          </dl>
        </section>

        <section className="rounded-xl border bg-white p-4">
          <h2 className="font-semibold">{t("orderShipping")}</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">{t("orderDelivery")}</dt>
              <dd className="text-end font-medium">{deliveryLabel || "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">{t("orderRegion")}</dt>
              <dd className="text-end font-medium">{addr.region || "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">{t("orderDistrict")}</dt>
              <dd className="text-end font-medium">{addr.district || "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">{t("orderStreet")}</dt>
              <dd className="text-end font-medium">{street || "—"}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-xl border bg-white p-4">
          <h2 className="font-semibold">{t("orderTotals")}</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">{t("orderSubtotal")}</dt>
              <dd>{money(o.subtotal, numberLocale)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">{t("orderDiscount")}</dt>
              <dd>{money(o.discount, numberLocale)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-500">{t("orderShippingCost")}</dt>
              <dd>{money(o.shipping_cost, numberLocale)}</dd>
            </div>
            <div className="flex justify-between gap-3 border-t pt-2 font-semibold">
              <dt>{t("orderTotal")}</dt>
              <dd>{money(o.total, numberLocale)}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-xl border bg-white p-4">
          <h2 className="font-semibold">{t("orderTracking")}</h2>
          {tracking ? (
            <p className="mt-2 text-sm text-slate-600">
              {[tracking.carrier, tracking.tracking_number].filter(Boolean).join(" · ") || t("orderNoTracking")}
            </p>
          ) : (
            <p className="mt-2 text-sm text-slate-500">{t("orderNoTracking")}</p>
          )}
        </section>
      </div>

      <section className="mt-6">
        <h2 className="font-semibold">{t("orderItems")}</h2>
        <ul className="mt-3 space-y-2">
          {(data.items || []).map((it, i) => (
            <li key={i} className="rounded-xl border bg-white px-4 py-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{it.title}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    ×{it.quantity} · {money(it.unit_price, numberLocale)}
                  </p>
                </div>
                <p className="font-semibold">{money(it.total_price ?? it.unit_price * it.quantity, numberLocale)}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
