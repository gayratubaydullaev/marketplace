"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button, Input } from "@gayrat/ui";
import { EmptyState, Field, Msg, PageHeader, Select, StatusBadge, TableShell } from "@/components/ui";
import { api, errMsg } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import { usePoll } from "@/hooks/usePoll";

type Courier = {
  id: string;
  full_name: string;
  phone: string;
  email?: string;
  status: string;
  vehicle_type: string;
  rating_avg: number;
  rating_count: number;
  on_shift?: boolean;
  active_jobs?: number;
};

export default function CouriersPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<Courier[]>([]);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState("");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "shift">("all");
  const [form, setForm] = useState({
    email: "",
    password: "",
    full_name: "",
    phone: "",
    vehicle_type: "bike",
    approve: true,
  });

  async function load(soft = false) {
    const data = await api<{ items: Courier[] }>("/v1/admin/couriers");
    setItems(data.items || []);
    if (!soft) setMsg("");
  }

  useEffect(() => {
    load().catch((e) => setMsg(errMsg(e)));
  }, []);

  usePoll(() => load(true).catch(() => {}), 20_000, true);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return items.filter((c) => {
      if (filter === "shift" && !c.on_shift) return false;
      if (!query) return true;
      return (
        c.full_name.toLowerCase().includes(query) ||
        c.phone.toLowerCase().includes(query) ||
        (c.email || "").toLowerCase().includes(query)
      );
    });
  }, [items, q, filter]);

  async function create() {
    setMsg("");
    setOk("");
    await api("/v1/admin/couriers", { method: "POST", body: JSON.stringify(form) });
    setOk(t("courierCreated"));
    setForm({ email: "", password: "", full_name: "", phone: "", vehicle_type: "bike", approve: true });
    await load();
  }

  async function approve(id: string) {
    await api(`/v1/admin/couriers/${id}/approve`, { method: "POST" });
    setOk(t("courierApproved"));
    await load(true);
  }

  async function block(id: string) {
    await api(`/v1/admin/couriers/${id}/block`, { method: "POST" });
    setOk(t("courierBlocked"));
    await load(true);
  }

  return (
    <div>
      <PageHeader
        title={t("pageCouriersTitle")}
        description={t("pageCouriersDesc")}
        actions={
          <Link
            href="/fleet"
            className="rounded-xl border border-teal/30 bg-teal/5 px-3 py-2 text-xs font-semibold text-teal hover:bg-teal/10"
          >
            {t("courierOpenFleet")}
          </Link>
        }
      />
      <Msg text={msg} />
      <Msg text={ok} tone="ok" />

      <section className="mb-8 rounded-2xl border bg-white p-4 shadow-sm">
        <h2 className="font-semibold">{t("courierCreate")}</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={t("courierEmail")}>
            <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <Field label={t("courierPassword")}>
            <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </Field>
          <Field label={t("courierName")}>
            <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </Field>
          <Field label={t("courierPhone")}>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </Field>
          <Field label={t("courierVehicle")}>
            <Select value={form.vehicle_type} onChange={(e) => setForm({ ...form, vehicle_type: e.target.value })}>
              <option value="bike">{t("courierVehicleBike")}</option>
              <option value="moto">{t("courierVehicleMoto")}</option>
              <option value="car">{t("courierVehicleCar")}</option>
            </Select>
          </Field>
        </div>
        <Button className="mt-3" variant="primary" onClick={() => create().catch((e) => setMsg(errMsg(e)))}>
          {t("courierCreate")}
        </Button>
      </section>

      <div className="mb-4 flex flex-wrap gap-2">
        <Input
          className="min-w-[12rem] flex-1"
          placeholder={t("courierSearch")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
          <option value="all">{t("courierFilterAll")}</option>
          <option value="shift">{t("courierFilterShift")}</option>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState text={t("courierEmpty")} />
      ) : (
        <TableShell>
          <thead>
            <tr className="border-b text-xs uppercase text-slate-500">
              <th className="px-3 py-2">{t("courierName")}</th>
              <th className="px-3 py-2">{t("courierPhone")}</th>
              <th className="px-3 py-2">{t("courierVehicle")}</th>
              <th className="px-3 py-2">{t("commonStatus")}</th>
              <th className="px-3 py-2">{t("courierJobs")}</th>
              <th className="px-3 py-2">{t("profileRating")}</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="border-b last:border-0">
                <td className="px-3 py-3">
                  <p className="font-medium">{c.full_name}</p>
                  <p className="text-xs text-slate-500">{c.email}</p>
                </td>
                <td className="px-3 py-3 text-sm">
                  <a className="text-teal hover:underline" href={`tel:${c.phone}`}>
                    {c.phone}
                  </a>
                </td>
                <td className="px-3 py-3 text-sm capitalize">{c.vehicle_type || "—"}</td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge status={c.status} />
                    {c.on_shift ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-800">
                        {t("courierOnShift")}
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="px-3 py-3 text-sm tabular-nums">{c.active_jobs ?? 0}</td>
                <td className="px-3 py-3 text-sm">
                  {Number(c.rating_avg || 0).toFixed(1)} ({c.rating_count})
                </td>
                <td className="px-3 py-3 text-right">
                  {c.status !== "active" ? (
                    <Button variant="primary" className="!px-2 !py-1 text-xs" onClick={() => approve(c.id).catch((e) => setMsg(errMsg(e)))}>
                      {t("courierApprove")}
                    </Button>
                  ) : (
                    <Button variant="secondary" className="!px-2 !py-1 text-xs" onClick={() => block(c.id).catch((e) => setMsg(errMsg(e)))}>
                      {t("courierBlock")}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
    </div>
  );
}
