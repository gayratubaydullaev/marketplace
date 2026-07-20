"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@gayrat/ui";
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
  };
  items?: { title: string; quantity: number; unit_price: number; vendor_id?: string }[];
};

type Tracking = { carrier?: string; tracking_number?: string; status?: string };

const TIMELINE = ["pending", "confirmed", "processing", "shipped", "delivered", "completed"];

function nextStatuses(current: string): string[] {
  switch (current) {
    case "pending":
    case "confirmed":
      return ["processing", "cancelled"];
    case "processing":
      return ["shipped", "cancelled"];
    case "shipped":
      return ["delivered"];
    default:
      return [];
  }
}

export default function OrderDetailPage() {
  const params = useParams();
  const id = String(params.id || "");
  const [data, setData] = useState<OrderPayload>({});
  const [tracking, setTracking] = useState<Tracking | null>(null);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState("");

  async function load() {
    const d = await api<OrderPayload>(`/v1/orders/${id}`);
    setData(d);
    api<Tracking>(`/v1/orders/${id}/tracking`)
      .then(setTracking)
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
    setOk(`Статус → ${status}`);
    await load();
  }

  const o = data.order;
  if (!o && !msg) return <p className="text-sm text-slate-500">Загрузка…</p>;
  if (!o) return <Msg text={msg} />;

  const idx = TIMELINE.indexOf(o.status);
  const addr = o.shipping_address || {};
  const actions = nextStatuses(o.status);

  return (
    <div>
      <PageHeader
        title={o.order_number || o.id.slice(0, 8)}
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

      {actions.length > 0 && (
        <section className="mt-6">
          <h2 className="font-semibold">Actions</h2>
          <div className="mt-2 flex flex-wrap gap-2">
            {actions.map((s) => (
              <Button
                key={s}
                variant={s === "cancelled" ? "secondary" : "primary"}
                className="!px-3 !py-1.5 text-xs"
                onClick={() => setStatus(s).catch((e) => setMsg(errMsg(e)))}
              >
                {s}
              </Button>
            ))}
          </div>
        </section>
      )}

      <section className="mt-6">
        <h2 className="font-semibold">Items</h2>
        <ul className="mt-2 space-y-2 text-sm">
          {(data.items || []).map((it, i) => (
            <li key={i} className="rounded-xl border bg-white px-3 py-2">
              {it.title} · ×{it.quantity} · {Number(it.unit_price).toLocaleString()} UZS
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-6">
        <h2 className="font-semibold">Shipping</h2>
        <p className="mt-2 text-sm text-slate-600">
          {[addr.city, addr.region, addr.street, addr.phone].filter(Boolean).join(", ") || "—"}
        </p>
      </section>

      <section className="mt-6">
        <h2 className="font-semibold">Tracking</h2>
        {tracking ? (
          <p className="mt-2 text-sm">
            {tracking.carrier || "—"} · {tracking.tracking_number || "—"} · <StatusBadge status={tracking.status} />
          </p>
        ) : (
          <p className="mt-2 text-sm text-slate-500">Нет трекинга</p>
        )}
      </section>
    </div>
  );
}
