"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Input } from "@gayrat/ui";
import { api, errMsg } from "@/lib/api";
import { Msg, PageHeader, StatusBadge } from "@/components/ui";

type OrderPayload = {
  order?: {
    id: string;
    order_number: string;
    status: string;
    payment_status?: string;
    total: number;
    shipping_address?: Record<string, string>;
    user_id?: string;
  };
  items?: { title: string; quantity: number; unit_price: number }[];
};

type Tracking = { carrier?: string; tracking_number?: string; status?: string };

const TIMELINE = ["pending", "confirmed", "processing", "shipped", "delivered", "completed"];
const ACTIONS = ["confirmed", "processing", "shipped", "delivered", "completed", "returned", "cancelled"];

export default function OrderDetailPage() {
  const params = useParams();
  const id = String(params.id || "");
  const [data, setData] = useState<OrderPayload>({});
  const [tracking, setTracking] = useState<Tracking | null>(null);
  const [trackingForm, setTrackingForm] = useState({ carrier: "", tracking_number: "" });
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState("");

  async function load() {
    const d = await api<OrderPayload>(`/v1/orders/${id}`);
    setData(d);
    api<Tracking>(`/v1/orders/${id}/tracking`)
      .then((result) => {
        setTracking(result);
        setTrackingForm({ carrier: result.carrier || "", tracking_number: result.tracking_number || "" });
      })
      .catch(() => setTracking(null));
  }

  useEffect(() => {
    if (!id) return;
    load().catch((e) => setMsg(errMsg(e)));
  }, [id]);

  async function setStatus(status: string) {
    setMsg("");
    setOk("");
    await api(`/v1/orders/${id}/status`, { method: "POST", body: JSON.stringify({ status }) });
    setOk(`Status → ${status}`);
    await load();
  }

  async function refund() {
    setMsg("");
    setOk("");
    await api(`/v1/orders/${id}/refund`, { method: "POST", body: "{}" });
    setOk("Refund requested");
    await load();
  }

  async function cancel() {
    setMsg("");
    setOk("");
    await api(`/v1/orders/${id}/cancel`, { method: "POST", body: "{}" });
    setOk("Cancelled");
    await load();
  }

  async function saveTracking() {
    setMsg("");
    setOk("");
    await api(`/v1/orders/${id}/tracking`, { method: "PUT", body: JSON.stringify(trackingForm) });
    setOk("Tracking updated");
    await load();
  }

  const o = data.order;
  if (!o && !msg) return <p className="text-sm text-slate-500">Loading…</p>;
  if (!o) return <Msg text={msg} />;

  const idx = TIMELINE.indexOf(o.status);
  const addr = o.shipping_address || {};

  return (
    <div>
      <PageHeader
        title={o.order_number}
        description={`Total ${o.total?.toLocaleString()} UZS`}
        actions={
          <Link href="/orders" className="text-sm text-teal hover:underline">
            ← Orders
          </Link>
        }
      />
      <Msg text={msg} />
      <Msg text={ok} tone="ok" />

      <div className="flex flex-wrap gap-2">
        <StatusBadge status={o.status} />
        <StatusBadge status={o.payment_status} />
      </div>

      <section className="mt-6">
        <h2 className="font-semibold">Timeline</h2>
        <ol className="mt-3 flex flex-wrap gap-2">
          {TIMELINE.map((step, i) => (
            <li
              key={step}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                o.status === step ? "bg-teal text-white" : idx >= i ? "bg-teal/15 text-teal" : "bg-slate-100 text-slate-400"
              }`}
            >
              {step}
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-6">
        <h2 className="font-semibold">Actions</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {ACTIONS.map((s) => (
            <Button key={s} variant="secondary" className="!px-3 !py-1.5 text-xs" onClick={() => setStatus(s).catch((e) => setMsg(errMsg(e)))}>
              {s}
            </Button>
          ))}
          {o.payment_status === "paid" && (
            <Button variant="ghost" className="!px-3 !py-1.5 text-xs text-rose-700" onClick={() => refund().catch((e) => setMsg(errMsg(e)))}>
              refund
            </Button>
          )}
          {["pending", "confirmed"].includes(o.status) && (
            <Button variant="ghost" className="!px-3 !py-1.5 text-xs text-rose-700" onClick={() => cancel().catch((e) => setMsg(errMsg(e)))}>
              cancel
            </Button>
          )}
        </div>
      </section>

      {Object.keys(addr).length > 0 && (
        <section className="mt-6">
          <h2 className="font-semibold">Shipping</h2>
          <p className="mt-2 text-sm text-slate-600">
            {[addr.region, addr.district, addr.phone, addr.delivery_method].filter(Boolean).join(" · ")}
          </p>
        </section>
      )}

      <section className="mt-6 rounded-xl border bg-white p-4">
        <h2 className="font-semibold">Tracking</h2>
        {tracking && <p className="mt-2 text-sm text-slate-600">{tracking.carrier} · {tracking.tracking_number} · {tracking.status}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          <Input placeholder="Carrier" value={trackingForm.carrier} onChange={(e) => setTrackingForm({ ...trackingForm, carrier: e.target.value })} />
          <Input placeholder="Tracking number" value={trackingForm.tracking_number} onChange={(e) => setTrackingForm({ ...trackingForm, tracking_number: e.target.value })} />
          <Button onClick={() => saveTracking().catch((e) => setMsg(errMsg(e)))}>Save tracking</Button>
        </div>
      </section>

      <ul className="mt-6 space-y-2">
        {(data.items || []).map((it, i) => (
          <li key={i} className="rounded-xl border bg-white px-4 py-3 text-sm">
            {it.title} × {it.quantity} — {(it.unit_price * it.quantity).toLocaleString()} UZS
          </li>
        ))}
      </ul>
    </div>
  );
}
