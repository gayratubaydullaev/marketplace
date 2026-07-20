"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@gayrat/ui";
import { EmptyState, Msg, PageHeader, Select, StatusBadge, TableShell } from "@/components/ui";
import { STOREFRONT_URL, api, errMsg } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

type Vendor = {
  id: string;
  name: string;
  slug: string;
  status: string;
  commission_rate?: number;
  rating: number;
  kyc_verified?: boolean;
};

export default function VendorsPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<Vendor[]>([]);
  const [status, setStatus] = useState("all");
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState("");

  async function load() {
    const data = await api<{ items: Vendor[] }>("/v1/admin/vendors");
    setItems(data.items || []);
  }

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("status");
    if (q) setStatus(q);
    load().catch((e) => setMsg(errMsg(e)));
  }, []);

  const filtered = useMemo(
    () => (status === "all" ? items : items.filter((v) => v.status === status)),
    [items, status]
  );

  async function approve(id: string) {
    if (!confirm("Approve this vendor?")) return;
    setMsg("");
    await api(`/v1/admin/vendors/${id}/approve`, { method: "POST" });
    setOk("Vendor approved");
    await load();
  }

  async function suspend(id: string) {
    if (!confirm("Suspend this vendor?")) return;
    setMsg("");
    await api(`/v1/admin/vendors/${id}/suspend`, { method: "POST" });
    setOk("Vendor suspended");
    await load();
  }

  async function setCommission(id: string, rate: number) {
    setMsg("");
    await api(`/v1/admin/vendors/${id}/commission`, {
      method: "PUT",
      body: JSON.stringify({ rate }),
    });
    setOk(`Commission → ${rate}%`);
    await load();
  }

  return (
    <div>
      <PageHeader title={t("pageVendorsTitle")} description={t("pageVendorsDesc")} />
      <Select className="mb-4" value={status} onChange={(e) => setStatus(e.target.value)}>
        {["all", "pending", "active", "suspended"].map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </Select>
      <Msg text={msg} />
      <Msg text={ok} tone="ok" />
      {filtered.length === 0 ? (
        <EmptyState text="No vendors" />
      ) : (
        <TableShell>
          <thead>
            <tr className="border-b bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">KYC</th>
              <th className="px-4 py-3">Rating</th>
              <th className="px-4 py-3">Commission %</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((v) => (
              <tr key={v.id} className="border-b last:border-0 hover:bg-slate-50/60">
                <td className="px-4 py-3">
                  <a
                    href={`${STOREFRONT_URL}/uz/vendors/${v.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-teal hover:underline"
                  >
                    {v.name}
                  </a>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={v.status} />
                </td>
                <td className="px-4 py-3">{v.kyc_verified ? "yes" : "no"}</td>
                <td className="px-4 py-3">{Number(v.rating || 0).toFixed(1)}</td>
                <td className="px-4 py-3">
                  <input
                    type="number"
                    className="w-20 rounded-lg border border-slate-200 px-2 py-1"
                    defaultValue={v.commission_rate ?? 10}
                    onBlur={(e) => setCommission(v.id, Number(e.target.value)).catch((err) => setMsg(errMsg(err)))}
                  />
                </td>
                <td className="space-x-2 whitespace-nowrap px-4 py-3">
                  <Button variant="ghost" className="!px-2 !py-1 text-xs text-teal" onClick={() => approve(v.id).catch((e) => setMsg(errMsg(e)))}>
                    approve
                  </Button>
                  <Button variant="ghost" className="!px-2 !py-1 text-xs text-rose-700" onClick={() => suspend(v.id).catch((e) => setMsg(errMsg(e)))}>
                    suspend
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </TableShell>
      )}
    </div>
  );
}
