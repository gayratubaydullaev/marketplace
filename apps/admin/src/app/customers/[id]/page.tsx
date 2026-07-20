"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { api, errMsg } from "@/lib/api";
import { EmptyState, Msg, PageHeader, StatusBadge } from "@/components/ui";

type User = {
  id: string;
  email: string;
  role: string;
  status: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  created_at?: string;
};

type Order = {
  id: string;
  order_number?: string;
  status?: string;
  payment_status?: string;
  total?: number;
  user_id?: string;
};

export default function CustomerDetailPage() {
  const params = useParams();
  const id = String(params.id || "");
  const [user, setUser] = useState<User | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!id) return;
    Promise.all([
      api<{ items: User[] }>("/v1/admin/users"),
      api<{ items: Order[] }>("/v1/orders").catch(() => ({ items: [] as Order[] })),
    ])
      .then(([users, ord]) => {
        const u = (users.items || []).find((x) => x.id === id) || null;
        setUser(u);
        setOrders((ord.items || []).filter((o) => o.user_id === id));
        if (!u) setMsg("User not found in admin list");
      })
      .catch((e) => setMsg(errMsg(e)));
  }, [id]);

  if (!user && !msg) return <p className="text-sm text-slate-500">Loading…</p>;

  return (
    <div>
      <PageHeader
        title={user?.email || "Customer"}
        description={[user?.first_name, user?.last_name].filter(Boolean).join(" ") || undefined}
        actions={
          <Link href="/customers" className="text-sm text-teal hover:underline">
            ← Customers
          </Link>
        }
      />
      <Msg text={msg} />
      {user && (
        <div className="mb-6 flex flex-wrap gap-3 text-sm">
          <StatusBadge status={user.role} />
          <StatusBadge status={user.status} />
          {user.phone && <span className="text-slate-500">{user.phone}</span>}
        </div>
      )}
      <h2 className="font-semibold">Orders</h2>
      {orders.length === 0 ? (
        <div className="mt-3">
          <EmptyState text="No orders linked to this user in the current orders list." />
        </div>
      ) : (
        <ul className="mt-3 space-y-2 text-sm">
          {orders.map((o) => (
            <li key={o.id}>
              <Link href={`/orders/${o.id}`} className="block rounded-xl border bg-white px-4 py-3 hover:shadow-sm">
                <span className="font-mono text-teal">{o.order_number || o.id.slice(0, 8)}</span>
                {" · "}
                {o.status} / {o.payment_status || "—"}
                {" · "}
                {(o.total || 0).toLocaleString()} UZS
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
