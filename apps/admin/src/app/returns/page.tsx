"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@gayrat/ui";
import { EmptyState, Msg, PageHeader, StatusBadge, TableShell } from "@/components/ui";
import { api, errMsg } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

type ReturnRequest = {
  id: string;
  order_id?: string;
  user_id?: string;
  order_number?: string;
  customer_name?: string;
  reason?: string;
  status: string;
  admin_note?: string | null;
  amount?: number;
  refund_amount?: number;
  created_at?: string;
};

type Order = { id: string; order_number?: string; user_id?: string; total?: number };
type User = { id: string; email?: string; first_name?: string; last_name?: string };

type Action = "approve" | "reject" | "receive" | "refund";

const STATUS_FILTERS = ["", "requested", "approved", "received", "rejected", "refunded"] as const;

function nextActions(status: string): Action[] {
  switch (status) {
    case "requested":
      return ["approve", "reject"];
    case "approved":
      return ["receive"];
    case "received":
      return ["refund"];
    default:
      return [];
  }
}

export default function ReturnsPage() {
  const { t, locale } = useI18n();
  const numberLocale = locale === "uz" ? "uz-UZ" : locale === "ru" ? "ru-RU" : locale === "ar" ? "ar" : "en";
  const [items, setItems] = useState<ReturnRequest[]>([]);
  const [allItems, setAllItems] = useState<ReturnRequest[]>([]);
  const [filter, setFilter] = useState<string>("");
  const [noteById, setNoteById] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState<string>("");

  const enrich = useCallback(async (rows: ReturnRequest[]) => {
    const [ordersRes, usersRes] = await Promise.all([
      api<{ items: Order[] }>("/v1/orders").catch(() => ({ items: [] as Order[] })),
      api<{ items: User[] }>("/v1/admin/users").catch(() => ({ items: [] as User[] })),
    ]);
    const orderById = new Map((ordersRes.items || []).map((o) => [o.id, o]));
    const userById = new Map((usersRes.items || []).map((u) => [u.id, u]));
    return rows.map((row) => {
      const order = row.order_id ? orderById.get(row.order_id) : undefined;
      const user = row.user_id ? userById.get(row.user_id) : undefined;
      const name = [user?.first_name, user?.last_name].filter(Boolean).join(" ") || user?.email;
      return {
        ...row,
        order_number: row.order_number || order?.order_number || row.order_id?.slice(0, 8),
        customer_name: row.customer_name || name,
        amount: row.amount ?? row.refund_amount ?? order?.total,
      };
    });
  }, []);

  const load = useCallback(async () => {
    const q = filter ? `?status=${encodeURIComponent(filter)}` : "";
    const data = await api<{ items: ReturnRequest[] }>(`/v1/admin/returns${q}`);
    const enriched = await enrich(data.items || []);
    setItems(enriched);
    if (!filter) setAllItems(enriched);
  }, [filter, enrich]);

  useEffect(() => {
    load().catch((e) => setMsg(errMsg(e)));
  }, [load]);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const item of allItems) m[item.status] = (m[item.status] || 0) + 1;
    return m;
  }, [allItems]);

  async function action(id: string, value: Action) {
    setMsg("");
    setOk("");
    setBusy(id + value);
    try {
      const note = noteById[id]?.trim() || "";
      if (value === "reject" && !note) {
        setMsg(t("returnsRejectNoteRequired"));
        return;
      }
      await api(`/v1/admin/returns/${id}/${value}`, {
        method: "POST",
        body: JSON.stringify({ note }),
      });
      setOk(t("returnsActionDone", { action: value }));
      await load();
    } catch (e) {
      setMsg(errMsg(e));
    } finally {
      setBusy("");
    }
  }

  const actionLabel = (value: Action) => {
    const key = `returnsAction_${value}`;
    const label = t(key);
    return label === key ? value : label;
  };

  return (
    <div>
      <PageHeader title={t("pageReturnsTitle")} description={t("pageReturnsDesc")} />
      <Msg text={msg} />
      <Msg text={ok} tone="ok" />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((value) => (
          <button
            key={value || "all"}
            type="button"
            onClick={() => setFilter(value)}
            className={`rounded-md px-3 py-1.5 text-sm ${
              filter === value ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
          >
            {value ? t(`returnsStatus_${value}`) : t("filterAll")}
            {!filter && value && counts[value] ? ` (${counts[value]})` : ""}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <EmptyState text={t("returnsEmpty")} />
      ) : (
        <TableShell>
          <thead>
            <tr className="border-b bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">{t("returnsColOrder")}</th>
              <th className="px-4 py-3">{t("returnsColCustomer")}</th>
              <th className="px-4 py-3">{t("returnsColReason")}</th>
              <th className="px-4 py-3">{t("returnsColAmount")}</th>
              <th className="px-4 py-3">{t("returnsColNote")}</th>
              <th className="px-4 py-3">{t("commonStatus")}</th>
              <th className="px-4 py-3">{t("returnsColCreated")}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const actions = nextActions(item.status);
              return (
                <tr key={item.id} className="border-b last:border-0 hover:bg-slate-50/60">
                  <td className="px-4 py-3 font-mono text-xs">
                    {item.order_id ? (
                      <Link href={`/orders/${item.order_id}`} className="text-teal hover:underline">
                        {item.order_number || item.order_id.slice(0, 8)}
                      </Link>
                    ) : (
                      item.order_number || "—"
                    )}
                  </td>
                  <td className="px-4 py-3">{item.customer_name || "—"}</td>
                  <td className="max-w-[14rem] px-4 py-3 text-sm">{item.reason || "—"}</td>
                  <td className="px-4 py-3 text-sm">
                    {item.amount != null ? `${Number(item.amount).toLocaleString(numberLocale)} UZS` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      {item.admin_note ? <div className="text-xs text-slate-500">{item.admin_note}</div> : null}
                      {actions.length > 0 ? (
                        <input
                          className="w-40 rounded border border-slate-200 px-2 py-1 text-xs"
                          placeholder={actions.includes("reject") ? t("returnsNoteRequired") : t("returnsNoteOptional")}
                          value={noteById[item.id] || ""}
                          onChange={(e) => setNoteById((prev) => ({ ...prev, [item.id]: e.target.value }))}
                        />
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={item.status} />
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {item.created_at ? new Date(item.created_at).toLocaleString(numberLocale) : "—"}
                  </td>
                  <td className="space-x-2 whitespace-nowrap px-4 py-3">
                    {actions.length === 0 ? (
                      <span className="text-xs text-slate-400">{t("returnsDone")}</span>
                    ) : (
                      actions.map((value) => (
                        <Button
                          key={value}
                          variant={value === "reject" ? "ghost" : "secondary"}
                          className={value === "reject" ? "!px-2 !py-1 text-xs text-rose-700" : "!px-2 !py-1 text-xs"}
                          disabled={busy.startsWith(item.id)}
                          onClick={() => action(item.id, value)}
                        >
                          {actionLabel(value)}
                        </Button>
                      ))
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableShell>
      )}
    </div>
  );
}
