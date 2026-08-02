"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api, errMsg } from "@/lib/api";
import { EmptyState, KpiCard, Msg, PageHeader, StatusBadge } from "@/components/ui";
import { useI18n } from "@/lib/i18n";

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
  created_at?: string;
};

export default function CustomerDetailPage() {
  const params = useParams();
  const id = String(params.id || "");
  const { t, locale } = useI18n();
  const numberLocale = locale === "uz" ? "uz-UZ" : locale === "ru" ? "ru-RU" : locale === "ar" ? "ar" : "en";
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
        if (!u) setMsg(t("customerNotFound"));
      })
      .catch((e) => setMsg(errMsg(e)));
  }, [id, t]);

  const snapshot = useMemo(() => {
    const totalSpent = orders.reduce((sum, o) => sum + Number(o.total || 0), 0);
    const completed = orders.filter((o) => o.status === "completed" || o.status === "delivered").length;
    const open = orders.filter(
      (o) => o.status && !["completed", "delivered", "cancelled", "returned"].includes(o.status)
    ).length;
    const recent = [...orders]
      .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
      .slice(0, 10);
    return { totalSpent, completed, open, recent };
  }, [orders]);

  if (!user && !msg) return <p className="text-sm text-slate-500">{t("commonLoading")}</p>;

  return (
    <div>
      <PageHeader
        title={user?.email || t("pageCustomersTitle")}
        description={[user?.first_name, user?.last_name].filter(Boolean).join(" ") || undefined}
        actions={
          <Link href="/customers" className="text-sm text-teal hover:underline">
            ← {t("navCustomers")}
          </Link>
        }
      />
      <Msg text={msg} />
      {user && (
        <div className="mb-6 flex flex-wrap gap-3 text-sm">
          <StatusBadge status={user.role} />
          <StatusBadge status={user.status} />
          {user.phone && <span className="text-slate-500">{user.phone}</span>}
          {user.created_at && (
            <span className="text-slate-500">
              {t("customerJoined")}: {new Date(user.created_at).toLocaleDateString(numberLocale)}
            </span>
          )}
        </div>
      )}

      {user && (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <KpiCard label={t("customerOrdersTotal")} value={String(orders.length)} />
          <KpiCard label={t("customerSpent")} value={`${snapshot.totalSpent.toLocaleString(numberLocale)} UZS`} />
          <KpiCard label={t("customerOpenOrders")} value={String(snapshot.open)} />
        </div>
      )}

      <h2 className="font-semibold">{t("customerOrdersSnapshot")}</h2>
      {snapshot.recent.length === 0 ? (
        <div className="mt-3">
          <EmptyState text={t("customerOrdersEmpty")} />
        </div>
      ) : (
        <ul className="mt-3 space-y-2 text-sm">
          {snapshot.recent.map((o) => (
            <li key={o.id}>
              <Link href={`/orders/${o.id}`} className="block rounded-xl border bg-white px-4 py-3 hover:shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-teal">{o.order_number || o.id.slice(0, 8)}</span>
                  <span className="text-xs text-slate-500">
                    {o.created_at ? new Date(o.created_at).toLocaleDateString(numberLocale) : "—"}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-2">
                  <StatusBadge status={o.status} />
                  <StatusBadge status={o.payment_status} />
                  <span className="font-semibold">{(o.total || 0).toLocaleString(numberLocale)} UZS</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
