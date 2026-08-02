"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Input } from "@gayrat/ui";
import { EmptyState, Msg, PageHeader, Select, StatusBadge, TableShell } from "@/components/ui";
import { api, errMsg } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { usePoll } from "@/hooks/usePoll";
import { DELIVERY_STATUSES, deliveryStatusLabel } from "@/lib/status";

type Job = {
  id: string;
  order_id: string;
  order_number?: string;
  status: string;
  courier_id?: string | null;
  courier_name?: string;
  pickup_address: string;
  dropoff_address: string;
  cod_amount: number;
  cod_dispute?: boolean;
};

type Courier = { id: string; full_name: string; status: string; on_shift?: boolean };
type Payout = {
  id: string;
  courier_id: string;
  courier_name?: string;
  amount: number;
  status: string;
  period_start: string;
  period_end: string;
};

type MsgItem = { id: string; sender_role: string; to_role?: string; body: string; created_at: string };

function DeliveriesInner() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const search = useSearchParams();
  const focusJob = search.get("job") || "";
  const statusFromUrl = search.get("status") || "";
  const disputedFromUrl = search.get("cod_dispute") === "true";
  const [items, setItems] = useState<Job[]>([]);
  const [couriers, setCouriers] = useState<Courier[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [status, setStatus] = useState(statusFromUrl);
  const [disputedOnly, setDisputedOnly] = useState(disputedFromUrl);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState("");
  const [busyId, setBusyId] = useState("");
  const [assignFor, setAssignFor] = useState<Record<string, string>>({});
  const [chatJob, setChatJob] = useState<string | null>(null);
  const [chat, setChat] = useState<MsgItem[]>([]);
  const [chatBody, setChatBody] = useState("");
  const [chatTo, setChatTo] = useState("courier");
  const [chatBusy, setChatBusy] = useState(false);
  const [payoutForm, setPayoutForm] = useState({ courier_id: "", period_start: "", period_end: "" });
  const numberLocale = locale === "uz" ? "uz-UZ" : locale === "ru" ? "ru-RU" : locale === "ar" ? "ar" : "en-US";

  useEffect(() => {
    if (statusFromUrl !== status) setStatus(statusFromUrl);
    if (disputedFromUrl !== disputedOnly) setDisputedOnly(disputedFromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFromUrl, disputedFromUrl]);

  function syncUrl(nextStatus: string, nextDisputed: boolean) {
    const p = new URLSearchParams();
    if (nextStatus) p.set("status", nextStatus);
    if (nextDisputed) p.set("cod_dispute", "true");
    if (focusJob) p.set("job", focusJob);
    const q = p.toString();
    router.replace(q ? `/deliveries?${q}` : "/deliveries", { scroll: false });
  }

  function onStatusChange(next: string) {
    setStatus(next);
    syncUrl(next, disputedOnly);
  }

  function onDisputedChange(next: boolean) {
    setDisputedOnly(next);
    syncUrl(status, next);
  }

  const load = useCallback(async (soft = false) => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (disputedOnly) params.set("cod_dispute", "true");
    const q = params.toString() ? `?${params}` : "";
    const [jobs, cos, pays] = await Promise.all([
      api<{ items: Job[] }>(`/v1/admin/deliveries${q}`),
      api<{ items: Courier[] }>("/v1/admin/couriers"),
      api<{ items: Payout[] }>("/v1/admin/courier-payouts"),
    ]);
    setItems(jobs.items || []);
    setCouriers((cos.items || []).filter((c) => c.status === "active"));
    setPayouts(pays.items || []);
    if (!soft) setMsg("");
  }, [status, disputedOnly]);

  useEffect(() => {
    load().catch((e) => setMsg(errMsg(e)));
  }, [load]);

  usePoll(() => load(true).catch(() => {}), 15_000, true);

  useEffect(() => {
    if (!focusJob) return;
    const el = document.getElementById(`delivery-${focusJob}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusJob, items]);

  useEffect(() => {
    setAssignFor((prev) => {
      const next = { ...prev };
      for (const j of items) {
        if (j.courier_id && !next[j.id]) next[j.id] = j.courier_id;
      }
      return next;
    });
  }, [items]);

  async function withBusy(id: string, fn: () => Promise<void>) {
    setBusyId(id);
    setMsg("");
    setOk("");
    try {
      await fn();
      await load(true);
    } catch (e) {
      setMsg(errMsg(e));
    } finally {
      setBusyId("");
    }
  }

  async function assign(id: string, auto = false) {
    const courier_id = assignFor[id];
    if (!auto && !courier_id) return;
    await withBusy(id, async () => {
      await api(`/v1/admin/deliveries/${id}/assign`, {
        method: "POST",
        body: JSON.stringify(auto ? {} : { courier_id }),
      });
      setOk(t(auto ? "deliveryRetryDone" : "deliveryAssigned"));
    });
  }

  async function reassign(id: string) {
    const courier_id = assignFor[id];
    if (!courier_id) return;
    await withBusy(id, async () => {
      await api(`/v1/admin/deliveries/${id}/reassign`, { method: "POST", body: JSON.stringify({ courier_id }) });
      setOk(t("deliveryReassigned"));
    });
  }

  async function retry(id: string) {
    await withBusy(id, async () => {
      await api(`/v1/admin/deliveries/${id}/auto-assign`, { method: "POST", body: "{}" });
      setOk(t("deliveryRetryDone"));
    });
  }

  async function autoAssignAll() {
    setBusyId("bulk");
    setMsg("");
    setOk("");
    try {
      const res = await api<{ attempted: number; assigned: number }>("/v1/admin/deliveries/auto-assign", {
        method: "POST",
        body: "{}",
      });
      setOk(t("deliveryAutoAssignDone", { assigned: res.assigned, attempted: res.attempted }));
      await load(true);
    } catch (e) {
      setMsg(errMsg(e));
    } finally {
      setBusyId("");
    }
  }

  async function openChat(id: string) {
    setChatJob(id);
    setChatBody("");
    const data = await api<{ items: MsgItem[] }>(`/v1/admin/deliveries/${id}/messages`);
    setChat(data.items || []);
  }

  async function sendChat() {
    if (!chatJob || !chatBody.trim() || chatBusy) return;
    setChatBusy(true);
    try {
      await api(`/v1/admin/deliveries/${chatJob}/messages`, {
        method: "POST",
        body: JSON.stringify({ body: chatBody.trim(), to_role: chatTo }),
      });
      setChatBody("");
      const data = await api<{ items: MsgItem[] }>(`/v1/admin/deliveries/${chatJob}/messages`);
      setChat(data.items || []);
    } catch (e) {
      setMsg(errMsg(e));
    } finally {
      setChatBusy(false);
    }
  }

  async function createPayout() {
    await api("/v1/admin/courier-payouts", { method: "POST", body: JSON.stringify(payoutForm) });
    setOk(t("payoutCreated"));
    await load(true);
  }

  async function markPaid(id: string) {
    await api(`/v1/admin/courier-payouts/${id}/paid`, { method: "POST" });
    setOk(t("payoutPaid"));
    await load(true);
  }

  function roleLabel(role: string) {
    const key = `chatRole_${role}`;
    const label = t(key);
    return label !== key ? label : role;
  }

  const pendingCount = items.filter((j) => j.status === "pending_assign").length;

  return (
    <div>
      <PageHeader
        title={t("pageDeliveriesTitle")}
        description={t("pageDeliveriesDesc")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/fleet"
              className="rounded-xl border border-teal/30 bg-teal/5 px-3 py-2 text-xs font-semibold text-teal hover:bg-teal/10"
            >
              {t("fleetOpenMap")}
            </Link>
            <Link
              href="/couriers"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              {t("navCouriers")}
            </Link>
            <Button
              variant="secondary"
              className="!px-3 !py-2 text-xs"
              disabled={busyId === "bulk"}
              onClick={() => autoAssignAll().catch((e) => setMsg(errMsg(e)))}
            >
              {t("deliveryAutoAssign")}
            </Button>
            <Select value={status} onChange={(e) => onStatusChange(e.target.value)}>
              <option value="">{t("deliveryFilterAll")}</option>
              {DELIVERY_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {deliveryStatusLabel(t, s)}
                </option>
              ))}
            </Select>
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
              <input type="checkbox" checked={disputedOnly} onChange={(e) => onDisputedChange(e.target.checked)} />
              {t("deliveryFilterDisputed")}
            </label>
          </div>
        }
      />
      <Msg text={msg} />
      <Msg text={ok} tone="ok" />

      {pendingCount > 0 && !status ? (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {t("deliveryPendingHint", { n: pendingCount })}{" "}
          <button type="button" className="font-semibold underline" onClick={() => onStatusChange("pending_assign")}>
            {deliveryStatusLabel(t, "pending_assign")}
          </button>
        </p>
      ) : null}

      {items.length === 0 ? (
        <EmptyState text={t("deliveryEmpty")} />
      ) : (
        <TableShell>
          <thead>
            <tr className="border-b text-xs uppercase text-slate-500">
              <th className="px-3 py-2">{t("deliveryColOrder")}</th>
              <th className="px-3 py-2">{t("commonStatus")}</th>
              <th className="px-3 py-2">{t("navCouriers")}</th>
              <th className="px-3 py-2">{t("deliveryColActions")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((j) => {
              const assigned = Boolean(j.courier_id);
              const busy = busyId === j.id;
              return (
                <tr
                  key={j.id}
                  id={`delivery-${j.id}`}
                  className={`border-b last:border-0 align-top ${
                    focusJob === j.id ? "bg-teal/10 ring-1 ring-inset ring-teal/30" : ""
                  }`}
                >
                  <td className="px-3 py-3">
                    <Link href={`/orders/${j.order_id}`} className="font-medium text-night hover:text-teal">
                      {j.order_number || j.order_id.slice(0, 8)}
                    </Link>
                    <p className="mt-0.5 text-xs text-slate-500">{j.dropoff_address || j.pickup_address || "—"}</p>
                    {j.cod_amount > 0 ? (
                      <p className="text-xs font-semibold text-amber-700">
                        {t("deliveryCodLabel")} {j.cod_amount.toLocaleString(numberLocale)} UZS
                        {j.cod_dispute ? (
                          <span className="ml-1 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-rose-700">
                            {t("deliveryDispute")}
                          </span>
                        ) : null}
                      </p>
                    ) : null}
                    <div className="mt-1 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="text-xs font-semibold text-teal underline"
                        onClick={() => openChat(j.id).catch((e) => setMsg(errMsg(e)))}
                      >
                        {t("deliveryChat")}
                      </button>
                      <Link href={`/fleet?job=${j.id}`} className="text-xs font-semibold text-teal underline">
                        {t("deliveryViewFleet")}
                      </Link>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadge status={j.status} label={deliveryStatusLabel(t, j.status)} />
                  </td>
                  <td className="px-3 py-3 text-sm">{j.courier_name || "—"}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Select
                        value={assignFor[j.id] || ""}
                        onChange={(e) => setAssignFor({ ...assignFor, [j.id]: e.target.value })}
                        disabled={busy || j.status === "delivered" || j.status === "cancelled"}
                      >
                        <option value="">—</option>
                        {couriers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.full_name}
                            {c.on_shift ? ` · ${t("fleetOnShift")}` : ""}
                          </option>
                        ))}
                      </Select>
                      {!assigned && j.status !== "delivered" && j.status !== "cancelled" ? (
                        <>
                          <Button
                            variant="primary"
                            className="!px-2 !py-1 text-xs"
                            disabled={busy || !assignFor[j.id]}
                            onClick={() => assign(j.id)}
                          >
                            {t("deliveryAssign")}
                          </Button>
                          {j.status === "pending_assign" ? (
                            <Button
                              variant="secondary"
                              className="!px-2 !py-1 text-xs"
                              disabled={busy}
                              onClick={() => assign(j.id, true)}
                            >
                              {t("deliveryAutoAssign")}
                            </Button>
                          ) : null}
                        </>
                      ) : null}
                      {assigned && j.status !== "delivered" && j.status !== "cancelled" ? (
                        <Button
                          variant="secondary"
                          className="!px-2 !py-1 text-xs"
                          disabled={busy || !assignFor[j.id] || assignFor[j.id] === j.courier_id}
                          onClick={() => reassign(j.id)}
                        >
                          {t("deliveryReassign")}
                        </Button>
                      ) : null}
                      {j.status === "pending_assign" ? (
                        <Button
                          variant="secondary"
                          className="!px-2 !py-1 text-xs"
                          disabled={busy}
                          onClick={() => retry(j.id)}
                        >
                          {t("deliveryRetry")}
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableShell>
      )}

      {chatJob ? (
        <section className="mt-6 rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">
              {t("deliveryChat")} · {chatJob.slice(0, 8)}
            </h2>
            <button type="button" className="text-sm text-slate-500 hover:text-night" onClick={() => setChatJob(null)}>
              {t("commonClose")}
            </button>
          </div>
          <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto text-sm">
            {chat.length === 0 ? <li className="text-slate-400">—</li> : null}
            {chat.map((m) => (
              <li key={m.id} className="rounded-lg bg-slate-50 px-3 py-2">
                <span className="text-[10px] font-bold uppercase text-slate-400">
                  {roleLabel(m.sender_role)}
                  {" → "}
                  {m.to_role && m.to_role !== "all" ? roleLabel(m.to_role) : t("chatRole_all")}
                </span>
                <p>{m.body}</p>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            {(
              [
                ["courier", "chatRole_courier"],
                ["customer", "chatRole_customer"],
                ["vendor", "chatRole_vendor"],
                ["all", "chatRole_all"],
              ] as const
            ).map(([v, key]) => (
              <button
                key={v}
                type="button"
                onClick={() => setChatTo(v)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  chatTo === v ? "bg-teal text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                {t(key)}
              </button>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <Input
              value={chatBody}
              onChange={(e) => setChatBody(e.target.value)}
              placeholder={t("deliveryChatPlaceholder", { to: roleLabel(chatTo) })}
              onKeyDown={(e) => e.key === "Enter" && sendChat()}
            />
            <Button variant="primary" className="!px-3 !py-2 text-xs" disabled={chatBusy} onClick={() => sendChat()}>
              {t("deliveryChatSend")}
            </Button>
          </div>
        </section>
      ) : null}

      <section className="mt-10">
        <h2 className="font-display text-xl font-bold">{t("pagePayoutsTitle")}</h2>
        <div className="mt-3 grid gap-3 rounded-2xl border bg-white p-4 sm:grid-cols-4">
          <Select value={payoutForm.courier_id} onChange={(e) => setPayoutForm({ ...payoutForm, courier_id: e.target.value })}>
            <option value="">{t("navCouriers")}</option>
            {couriers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.full_name}
              </option>
            ))}
          </Select>
          <Input type="date" value={payoutForm.period_start} onChange={(e) => setPayoutForm({ ...payoutForm, period_start: e.target.value })} />
          <Input type="date" value={payoutForm.period_end} onChange={(e) => setPayoutForm({ ...payoutForm, period_end: e.target.value })} />
          <Button variant="primary" onClick={() => createPayout().catch((e) => setMsg(errMsg(e)))}>
            {t("payoutCreate")}
          </Button>
        </div>
        <ul className="mt-4 space-y-2">
          {payouts.length === 0 ? (
            <li>
              <EmptyState text={t("payoutEmpty")} />
            </li>
          ) : (
            payouts.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-white px-3 py-2 text-sm">
                <span>
                  {p.courier_name || p.courier_id.slice(0, 8)} · {p.period_start}→{p.period_end} ·{" "}
                  {p.amount.toLocaleString(numberLocale)} UZS · <StatusBadge status={p.status} />
                </span>
                {p.status !== "paid" ? (
                  <Button variant="secondary" className="!px-2 !py-1 text-xs" onClick={() => markPaid(p.id).catch((e) => setMsg(errMsg(e)))}>
                    {t("payoutMarkPaid")}
                  </Button>
                ) : null}
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}

export default function DeliveriesPage() {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-white/80" />}>
      <DeliveriesInner />
    </Suspense>
  );
}
