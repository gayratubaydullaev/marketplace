"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@gayrat/ui";
import { EmptyState, Msg, PageHeader, StatusBadge, TableShell } from "@/components/ui";
import { api, errMsg } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

type ReturnRequest = {
  id: string;
  order_id?: string;
  order_number?: string;
  customer_name?: string;
  reason?: string;
  status: string;
  admin_note?: string | null;
  amount?: number;
  created_at?: string;
};

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
  const { t } = useI18n();
  const [items, setItems] = useState<ReturnRequest[]>([]);
  const [filter, setFilter] = useState<string>("");
  const [noteById, setNoteById] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState<string>("");

  const load = useCallback(async () => {
    const q = filter ? `?status=${encodeURIComponent(filter)}` : "";
    const data = await api<{ items: ReturnRequest[] }>(`/v1/admin/returns${q}`);
    setItems(data.items || []);
  }, [filter]);

  useEffect(() => {
    load().catch((e) => setMsg(errMsg(e)));
  }, [load]);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const item of items) m[item.status] = (m[item.status] || 0) + 1;
    return m;
  }, [items]);

  async function action(id: string, value: Action) {
    setMsg("");
    setOk("");
    setBusy(id + value);
    try {
      const note = noteById[id]?.trim() || "";
      if (value === "reject" && !note) {
        setMsg("Rejection note is required");
        return;
      }
      await api(`/v1/admin/returns/${id}/${value}`, {
        method: "POST",
        body: JSON.stringify({ note }),
      });
      setOk(`Return ${value}d`);
      await load();
    } catch (e) {
      setMsg(errMsg(e));
    } finally {
      setBusy("");
    }
  }

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
            {value || "all"}
            {!filter && value && counts[value] ? ` (${counts[value]})` : ""}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <EmptyState text="No return requests" />
      ) : (
        <TableShell>
          <thead>
            <tr className="border-b bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Reason</th>
              <th className="px-4 py-3">Note</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const actions = nextActions(item.status);
              return (
                <tr key={item.id} className="border-b last:border-0 hover:bg-slate-50/60">
                  <td className="px-4 py-3 font-mono text-xs">{item.order_number || item.order_id || "—"}</td>
                  <td className="px-4 py-3">{item.customer_name || "—"}</td>
                  <td className="max-w-[14rem] px-4 py-3 text-sm">{item.reason || "—"}</td>
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      {item.admin_note ? <div className="text-xs text-slate-500">{item.admin_note}</div> : null}
                      {actions.length > 0 ? (
                        <input
                          className="w-40 rounded border border-slate-200 px-2 py-1 text-xs"
                          placeholder={actions.includes("reject") ? "note (required for reject)" : "admin note"}
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
                    {item.created_at ? new Date(item.created_at).toLocaleString() : "—"}
                  </td>
                  <td className="space-x-2 whitespace-nowrap px-4 py-3">
                    {actions.length === 0 ? (
                      <span className="text-xs text-slate-400">done</span>
                    ) : (
                      actions.map((value) => (
                        <Button
                          key={value}
                          variant={value === "reject" ? "ghost" : "secondary"}
                          className={value === "reject" ? "!px-2 !py-1 text-xs text-rose-700" : "!px-2 !py-1 text-xs"}
                          disabled={busy.startsWith(item.id)}
                          onClick={() => action(item.id, value)}
                        >
                          {value}
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
