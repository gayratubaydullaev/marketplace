"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Input } from "@gayrat/ui";
import { api, errMsg } from "@/lib/api";
import { Msg, PageHeader, StatusBadge } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { deliveryStatusLabel } from "@/lib/status";

type OrderPayload = {
  order?: {
    id: string;
    order_number: string;
    status: string;
    payment_status?: string;
    payment_method?: string;
    fulfillment_status?: string;
    guest_email?: string | null;
    user_id?: string | null;
    currency?: string;
    subtotal?: number;
    discount?: number;
    shipping_cost?: number;
    tax_total?: number;
    total: number;
    coupon_code?: string | null;
    notes?: string | null;
    shipping_address?: Record<string, string | undefined>;
    created_at?: string;
    shipped_at?: string | null;
  };
  items?: {
    title: string;
    quantity: number;
    unit_price: number;
    total_price?: number;
    vendor_id?: string | null;
    product_id?: string;
    status?: string;
  }[];
};

const COD_METHODS = new Set(["cash_on_delivery", "card_on_delivery", "bank_transfer"]);

type Tracking = { carrier?: string; tracking_number?: string; status?: string; tracking_url?: string };

type DeliveryJob = {
  id: string;
  status: string;
  courier_name?: string;
  courier_phone?: string;
  pickup_address?: string;
  dropoff_address?: string;
};

const TIMELINE = ["pending", "confirmed", "processing", "shipped", "delivered", "completed"] as const;

function nextStatuses(current: string): string[] {
  switch (current) {
    case "pending":
      return ["confirmed", "cancelled"];
    case "confirmed":
      return ["processing", "cancelled"];
    case "processing":
      return ["shipped", "returned"];
    case "shipped":
      return ["delivered"];
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
  const map: Record<string, string> = {
    unpaid: "payUnpaid",
    paid: "payPaid",
    refunded: "payRefunded",
  };
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
  const [trackingForm, setTrackingForm] = useState({ carrier: "", tracking_number: "" });
  const [deliveryJob, setDeliveryJob] = useState<DeliveryJob | null>(null);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState("");

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
        if (!result?.carrier && !result?.tracking_number) {
          setTracking(null);
          return;
        }
        setTracking(result);
        setTrackingForm({ carrier: result.carrier || "", tracking_number: result.tracking_number || "" });
      })
      .catch(() => setTracking(null));
    api<DeliveryJob>(`/v1/delivery/orders/${id}`)
      .then((job) => setDeliveryJob(job))
      .catch(() => setDeliveryJob(null));
  }

  useEffect(() => {
    if (!id) return;
    load().catch((e) => setMsg(errMsg(e)));
  }, [id]);

  async function setStatus(status: string) {
    setMsg("");
    setOk("");
    await api(`/v1/orders/${id}/status`, { method: "POST", body: JSON.stringify({ status }) });
    setOk(t("orderStatusChanged", { status: labelStatus(status) }));
    await load();
  }

  async function refund() {
    setMsg("");
    setOk("");
    await api(`/v1/orders/${id}/refund`, { method: "POST", body: "{}" });
    setOk(t("orderRefundOk"));
    await load();
  }

  async function cancel() {
    setMsg("");
    setOk("");
    await api(`/v1/orders/${id}/cancel`, { method: "POST", body: "{}" });
    setOk(t("orderCancelOk"));
    await load();
  }

  async function collectPayment() {
    setMsg("");
    setOk("");
    await api(`/v1/payments/collect`, { method: "POST", body: JSON.stringify({ order_id: id }) });
    setOk(t("orderCollectOk"));
    await load();
  }

  async function saveTracking() {
    setMsg("");
    setOk("");
    await api(`/v1/orders/${id}/tracking`, { method: "PUT", body: JSON.stringify(trackingForm) });
    setOk(t("orderTrackingSaved"));
    await load();
  }

  const o = data.order;
  if (!o && !msg) return <p className="text-sm text-slate-500">{t("commonLoading")}</p>;
  if (!o) return <Msg text={msg} />;

  const idx = TIMELINE.indexOf(o.status as (typeof TIMELINE)[number]);
  const addr = o.shipping_address || {};
  const street = addr.address_line1 || addr.street || addr.building || "";
  const delivery =
    addr.delivery_method === "pickup"
      ? t("deliveryPickup")
      : addr.delivery_method === "courier"
        ? t("deliveryCourier")
        : addr.delivery_method || "";
  const actions = nextStatuses(o.status);
  const unpaidCOD = o.payment_status !== "paid" && COD_METHODS.has(o.payment_method || "");
  const needsPayBeforeHandoff = unpaidCOD && (o.status === "shipped" || actions.includes("delivered"));

  return (
    <div>
      <PageHeader
        title={o.order_number}
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

      <section className="mt-6">
        <h2 className="font-semibold">{t("orderActions")}</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {unpaidCOD && (
            <Button variant="primary" className="!px-3 !py-1.5 text-xs" onClick={() => collectPayment().catch((e) => setMsg(errMsg(e)))}>
              {t("orderCollectPay")}
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
          {o.payment_status === "paid" && (
            <Button variant="ghost" className="!px-3 !py-1.5 text-xs text-rose-700" onClick={() => refund().catch((e) => setMsg(errMsg(e)))}>
              {t("orderRefund")}
            </Button>
          )}
          {["pending", "confirmed"].includes(o.status) && !actions.includes("cancelled") && (
            <Button variant="ghost" className="!px-3 !py-1.5 text-xs text-rose-700" onClick={() => cancel().catch((e) => setMsg(errMsg(e)))}>
              {t("orderCancel")}
            </Button>
          )}
        </div>
        {needsPayBeforeHandoff && <p className="mt-2 text-xs text-amber-700">{t("orderPayBeforeDeliver")}</p>}
      </section>

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
            {o.coupon_code ? (
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">{t("orderCoupon")}</dt>
                <dd className="text-end font-medium">{o.coupon_code}</dd>
              </div>
            ) : null}
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
              <dd className="text-end font-medium">{delivery || "—"}</dd>
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

        {addr.delivery_method === "courier" || deliveryJob ? (
          <section className="rounded-xl border border-teal/20 bg-teal/5 p-4 sm:col-span-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="font-semibold">{t("orderDeliveryJob")}</h2>
              {deliveryJob ? (
                <Link
                  href={`/deliveries?job=${deliveryJob.id}`}
                  className="text-xs font-semibold text-teal hover:underline"
                >
                  {t("orderOpenDelivery")} →
                </Link>
              ) : null}
            </div>
            {deliveryJob ? (
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <div className="flex justify-between gap-3 sm:block">
                  <dt className="text-slate-500">{t("commonStatus")}</dt>
                  <dd className="sm:mt-1">
                    <StatusBadge status={deliveryJob.status} label={deliveryStatusLabel(t, deliveryJob.status)} />
                  </dd>
                </div>
                <div className="flex justify-between gap-3 sm:block">
                  <dt className="text-slate-500">{t("navCouriers")}</dt>
                  <dd className="font-medium sm:mt-1">
                    {deliveryJob.courier_name || "—"}
                    {deliveryJob.courier_phone ? ` · ${deliveryJob.courier_phone}` : ""}
                  </dd>
                </div>
                {deliveryJob.dropoff_address ? (
                  <div className="sm:col-span-2">
                    <dt className="text-slate-500">{t("orderStreet")}</dt>
                    <dd className="mt-0.5 font-medium">{deliveryJob.dropoff_address}</dd>
                  </div>
                ) : null}
              </dl>
            ) : (
              <p className="mt-2 text-sm text-slate-500">{t("orderNoDeliveryJob")}</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href="/deliveries"
                className="rounded-lg border border-teal/30 bg-white px-3 py-1.5 text-xs font-semibold text-teal"
              >
                {t("navDeliveries")}
              </Link>
              <Link
                href="/fleet"
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
              >
                {t("navFleet")}
              </Link>
            </div>
          </section>
        ) : null}

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
            {(o.tax_total || 0) > 0 && (
              <div className="flex justify-between gap-3">
                <dt className="text-slate-500">{t("orderTax")}</dt>
                <dd>{money(o.tax_total, numberLocale)}</dd>
              </div>
            )}
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
              {[tracking.carrier, tracking.tracking_number, tracking.status].filter(Boolean).join(" · ") || t("orderNoTracking")}
            </p>
          ) : (
            <p className="mt-2 text-sm text-slate-500">{t("orderNoTracking")}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Input
              placeholder={t("orderCarrier")}
              value={trackingForm.carrier}
              onChange={(e) => setTrackingForm({ ...trackingForm, carrier: e.target.value })}
            />
            <Input
              placeholder={t("orderTrackingNumber")}
              value={trackingForm.tracking_number}
              onChange={(e) => setTrackingForm({ ...trackingForm, tracking_number: e.target.value })}
            />
            <Button onClick={() => saveTracking().catch((e) => setMsg(errMsg(e)))}>{t("orderSaveTracking")}</Button>
          </div>
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
