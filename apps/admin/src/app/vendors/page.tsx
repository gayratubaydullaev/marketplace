"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Input } from "@gayrat/ui";
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
  kyc_status?: string;
};

type CommissionTier = { id: string; min_volume: number; max_volume?: number | null; rate: number };
type Tab = "list" | "kyc" | "tiers";

export default function VendorsPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<Vendor[]>([]);
  const [kycItems, setKycItems] = useState<Vendor[]>([]);
  const [tiers, setTiers] = useState<CommissionTier[]>([]);
  const [tab, setTab] = useState<Tab>("list");
  const [status, setStatus] = useState("all");
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState("");
  const [newTier, setNewTier] = useState({ min: "", max: "", rate: "" });

  async function load() {
    const data = await api<{ items: Vendor[] }>("/v1/admin/vendors");
    setItems(data.items || []);
  }

  async function loadKyc() {
    const data = await api<{ items: Vendor[] }>("/v1/admin/vendors/kyc/pending");
    setKycItems(data.items || []);
  }

  async function loadTiers() {
    const data = await api<{ items: CommissionTier[] }>("/v1/admin/commissions/tiers");
    setTiers(data.items || []);
  }

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("status");
    if (q) setStatus(q);
    load().catch((e) => setMsg(errMsg(e)));
  }, []);

  useEffect(() => {
    if (tab === "kyc") loadKyc().catch((e) => setMsg(errMsg(e)));
    if (tab === "tiers") loadTiers().catch((e) => setMsg(errMsg(e)));
  }, [tab]);

  const filtered = useMemo(
    () => (status === "all" ? items : items.filter((v) => v.status === status)),
    [items, status]
  );

  async function approve(id: string) {
    if (!confirm("Approve this vendor?")) return;
    await api(`/v1/admin/vendors/${id}/approve`, { method: "POST" });
    setOk("Vendor approved");
    await load();
  }

  async function suspend(id: string) {
    if (!confirm("Suspend this vendor?")) return;
    await api(`/v1/admin/vendors/${id}/suspend`, { method: "POST" });
    setOk("Vendor suspended");
    await load();
  }

  async function setCommission(id: string, rate: number) {
    await api(`/v1/admin/vendors/${id}/commission`, { method: "PUT", body: JSON.stringify({ rate }) });
    setOk(`Commission → ${rate}%`);
    await load();
  }

  async function setKyc(id: string, kycStatus: "approved" | "rejected") {
    await api(`/v1/admin/vendors/${id}/kyc`, { method: "POST", body: JSON.stringify({ status: kycStatus }) });
    setOk(`KYC ${kycStatus}`);
    await Promise.all([load(), loadKyc()]);
  }

  function tierPayload(tier: { min_volume: number; max_volume?: number | null; rate: number }) {
    return { min_volume: Number(tier.min_volume), max_volume: tier.max_volume ?? null, rate: Number(tier.rate) };
  }

  async function createTier() {
    await api("/v1/admin/commissions/tiers", {
      method: "POST",
      body: JSON.stringify(tierPayload({ min_volume: Number(newTier.min), max_volume: newTier.max ? Number(newTier.max) : null, rate: Number(newTier.rate) })),
    });
    setNewTier({ min: "", max: "", rate: "" });
    setOk("Commission tier created");
    await loadTiers();
  }

  async function updateTier(tier: CommissionTier) {
    await api(`/v1/admin/commissions/tiers/${tier.id}`, { method: "PUT", body: JSON.stringify(tierPayload(tier)) });
    setOk("Commission tier updated");
    await loadTiers();
  }

  async function deleteTier(id: string) {
    if (!confirm("Delete this commission tier?")) return;
    await api(`/v1/admin/commissions/tiers/${id}`, { method: "DELETE" });
    setOk("Commission tier deleted");
    await loadTiers();
  }

  return (
    <div>
      <PageHeader title={t("pageVendorsTitle")} description={t("pageVendorsDesc")} />
      <div className="mb-4 flex flex-wrap gap-2">
        {(["list", "kyc", "tiers"] as Tab[]).map((value) => (
          <Button key={value} variant={tab === value ? "primary" : "secondary"} onClick={() => setTab(value)}>
            {value === "list" ? t("tabList") : value === "kyc" ? t("tabKyc") : t("tabTiers")}
          </Button>
        ))}
      </div>
      <Msg text={msg} />
      <Msg text={ok} tone="ok" />

      {tab === "list" && (
        <>
          <Select className="mb-4" value={status} onChange={(e) => setStatus(e.target.value)}>
            {["all", "pending", "active", "suspended"].map((value) => <option key={value} value={value}>{value}</option>)}
          </Select>
          {filtered.length === 0 ? <EmptyState text="No vendors" /> : (
            <TableShell>
              <thead><tr className="border-b bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500"><th className="px-4 py-3">Name</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">KYC</th><th className="px-4 py-3">Rating</th><th className="px-4 py-3">Commission %</th><th className="px-4 py-3" /></tr></thead>
              <tbody>{filtered.map((vendor) => (
                <tr key={vendor.id} className="border-b last:border-0 hover:bg-slate-50/60">
                  <td className="px-4 py-3"><a href={`${STOREFRONT_URL}/uz/vendors/${vendor.slug}`} target="_blank" rel="noreferrer" className="font-medium text-teal hover:underline">{vendor.name}</a></td>
                  <td className="px-4 py-3"><StatusBadge status={vendor.status} /></td>
                  <td className="px-4 py-3">{vendor.kyc_status || (vendor.kyc_verified ? "approved" : "pending")}</td>
                  <td className="px-4 py-3">{Number(vendor.rating || 0).toFixed(1)}</td>
                  <td className="px-4 py-3"><Input type="number" className="w-20" defaultValue={vendor.commission_rate ?? 10} onBlur={(e) => setCommission(vendor.id, Number(e.target.value)).catch((err) => setMsg(errMsg(err)))} /></td>
                  <td className="space-x-2 whitespace-nowrap px-4 py-3"><Button variant="ghost" className="!px-2 !py-1 text-xs text-teal" onClick={() => approve(vendor.id).catch((e) => setMsg(errMsg(e)))}>approve</Button><Button variant="ghost" className="!px-2 !py-1 text-xs text-rose-700" onClick={() => suspend(vendor.id).catch((e) => setMsg(errMsg(e)))}>suspend</Button></td>
                </tr>
              ))}</tbody>
            </TableShell>
          )}
        </>
      )}

      {tab === "kyc" && (kycItems.length === 0 ? <EmptyState text="No pending KYC requests" /> : (
        <TableShell><thead><tr className="border-b bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500"><th className="px-4 py-3">Vendor</th><th className="px-4 py-3">Status</th><th className="px-4 py-3" /></tr></thead>
          <tbody>{kycItems.map((vendor) => <tr key={vendor.id} className="border-b last:border-0 hover:bg-slate-50/60"><td className="px-4 py-3 font-medium">{vendor.name}</td><td className="px-4 py-3">{vendor.kyc_status || "pending"}</td><td className="space-x-2 px-4 py-3"><Button variant="secondary" className="!px-2 !py-1 text-xs" onClick={() => setKyc(vendor.id, "approved").catch((e) => setMsg(errMsg(e)))}>Approve</Button><Button variant="ghost" className="!px-2 !py-1 text-xs text-rose-700" onClick={() => setKyc(vendor.id, "rejected").catch((e) => setMsg(errMsg(e)))}>Reject</Button></td></tr>)}</tbody>
        </TableShell>
      ))}

      {tab === "tiers" && (
        <>
          <div className="mb-4 grid gap-2 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm md:grid-cols-4">
            <Input type="number" placeholder="Min volume" value={newTier.min} onChange={(e) => setNewTier({ ...newTier, min: e.target.value })} />
            <Input type="number" placeholder="Max volume (optional)" value={newTier.max} onChange={(e) => setNewTier({ ...newTier, max: e.target.value })} />
            <Input type="number" placeholder="Rate %" value={newTier.rate} onChange={(e) => setNewTier({ ...newTier, rate: e.target.value })} />
            <Button onClick={() => createTier().catch((e) => setMsg(errMsg(e)))}>Create tier</Button>
          </div>
          {tiers.length === 0 ? <EmptyState text="No commission tiers" /> : (
            <TableShell><thead><tr className="border-b bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500"><th className="px-4 py-3">Min volume</th><th className="px-4 py-3">Max volume</th><th className="px-4 py-3">Rate %</th><th className="px-4 py-3" /></tr></thead>
              <tbody>{tiers.map((tier) => <tr key={tier.id} className="border-b last:border-0"><td className="px-4 py-3"><Input type="number" value={tier.min_volume} onChange={(e) => setTiers((all) => all.map((x) => x.id === tier.id ? { ...x, min_volume: Number(e.target.value) } : x))} /></td><td className="px-4 py-3"><Input type="number" value={tier.max_volume ?? ""} onChange={(e) => setTiers((all) => all.map((x) => x.id === tier.id ? { ...x, max_volume: e.target.value === "" ? null : Number(e.target.value) } : x))} /></td><td className="px-4 py-3"><Input type="number" value={tier.rate} onChange={(e) => setTiers((all) => all.map((x) => x.id === tier.id ? { ...x, rate: Number(e.target.value) } : x))} /></td><td className="space-x-2 px-4 py-3"><Button variant="secondary" className="!px-2 !py-1 text-xs" onClick={() => updateTier(tier).catch((e) => setMsg(errMsg(e)))}>Save</Button><Button variant="ghost" className="!px-2 !py-1 text-xs text-rose-700" onClick={() => deleteTier(tier.id).catch((e) => setMsg(errMsg(e)))}>Delete</Button></td></tr>)}</tbody>
            </TableShell>
          )}
        </>
      )}
    </div>
  );
}
