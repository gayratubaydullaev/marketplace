"use client";

import { useEffect, useState } from "react";
import { Button, Input, Card } from "@gayrat/ui";
import { api, errMsg, TENANT } from "@/lib/api";
import { Msg, PageHeader, SectionTabs } from "@/components/ui";
import { useI18n } from "@/lib/i18n";

type Tab = "mode" | "seo" | "payments" | "payouts" | "notifications";

export default function SettingsPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("mode");
  const [mode, setMode] = useState("multi_vendor");
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState("");
  const [synonyms, setSynonyms] = useState<Record<string, string[]>>({});
  const [term, setTerm] = useState("");
  const [synList, setSynList] = useState("");
  const [providers, setProviders] = useState<string[]>([]);
  const [outbox, setOutbox] = useState<{ id?: string; channel?: string; status?: string; subject?: string }[]>([]);
  const [notifyTo, setNotifyTo] = useState("");
  const [notifyBody, setNotifyBody] = useState("");
  const [settingsJson, setSettingsJson] = useState('{"currency":"UZS","default_locale":"uz"}');

  useEffect(() => {
    api<{ mode?: string }>("/v1/tenant/mode")
      .then(({ mode: currentMode }) => setMode(currentMode || "multi_vendor"))
      .catch(() => undefined);
    api<{ synonyms?: Record<string, string[]> }>("/v1/search/synonyms")
      .then((d) => setSynonyms(d.synonyms || {}))
      .catch(() => undefined);
    api<{ providers?: string[]; items?: string[] }>("/v1/payments/providers")
      .then((d) => setProviders(d.providers || d.items || ["payme", "click", "uzum", "stripe", "bank_transfer"]))
      .catch(() => setProviders(["payme", "click", "uzum", "stripe", "bank_transfer"]));
  }, []);

  useEffect(() => {
    if (tab !== "notifications") return;
    api<{ items?: typeof outbox }>("/v1/notifications/outbox")
      .then((d) => setOutbox(d.items || []))
      .catch(() => setOutbox([]));
  }, [tab]);

  async function switchMode() {
    setMsg("");
    await api("/v1/admin/tenant/mode", { method: "POST", body: JSON.stringify({ mode }) });
    setOk(`Mode set to ${mode}`);
  }

  async function saveTenantSettings() {
    setMsg("");
    let body: unknown = {};
    try {
      body = JSON.parse(settingsJson);
    } catch {
      setMsg("Invalid settings JSON");
      return;
    }
    await api("/v1/admin/tenant/settings", { method: "PUT", body: JSON.stringify(body) });
    setOk("Tenant settings saved");
  }

  async function runPayouts() {
    setMsg("");
    const r = await api<{ payouts_created?: number; created?: number }>("/v1/admin/payouts/run", { method: "POST" });
    setOk(`Payouts created: ${r.payouts_created ?? r.created ?? 0}`);
  }

  async function saveSynonym() {
    setMsg("");
    const list = synList.split(",").map((s) => s.trim()).filter(Boolean);
    await api("/v1/search/synonyms", {
      method: "POST",
      body: JSON.stringify({ term, synonyms: list }),
    });
    const d = await api<{ synonyms?: Record<string, string[]> }>("/v1/search/synonyms");
    setSynonyms(d.synonyms || {});
    setTerm("");
    setSynList("");
    setOk("Synonym saved");
  }

  async function deleteSynonym(t: string) {
    setMsg("");
    await api(`/v1/search/synonyms/${encodeURIComponent(t)}`, { method: "DELETE" });
    const d = await api<{ synonyms?: Record<string, string[]> }>("/v1/search/synonyms");
    setSynonyms(d.synonyms || {});
    setOk(`Deleted synonym ${t}`);
  }

  async function reindex() {
    setMsg("");
    const r = await api<{ indexed?: number }>("/v1/search/reindex", { method: "POST" });
    setOk(`Reindexed ${r.indexed ?? 0} products`);
  }

  async function sendNotify() {
    setMsg("");
    await api("/v1/notifications/send", {
      method: "POST",
      body: JSON.stringify({ to: notifyTo, body: notifyBody, channel: "email" }),
    });
    setOk("Notification queued");
    setNotifyBody("");
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "mode", label: "Mode" },
    { id: "seo", label: "SEO / Search" },
    { id: "payments", label: "Payments" },
    { id: "payouts", label: "Payouts" },
    { id: "notifications", label: "Notifications" },
  ];

  return (
    <div>
      <PageHeader title={t("pageSettingsTitle")} description={`${t("pageSettingsDesc")} · ${TENANT}`} />
      <div className="mt-4">
        <SectionTabs items={tabs} value={tab} onChange={(id) => setTab(id as Tab)} />
      </div>

      {tab === "mode" && (
        <Card className="mt-6 space-y-4">
          <label className="block text-sm">
            Tenant mode
            <select className="mt-1 block rounded border px-3 py-2" value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="multi_vendor">multi_vendor</option>
              <option value="single_store">single_store</option>
            </select>
          </label>
          <Button onClick={() => switchMode().catch((e) => setMsg(errMsg(e)))}>Save mode</Button>
          <label className="block text-sm">
            Tenant settings JSON
            <textarea
              className="mt-1 w-full rounded border px-3 py-2 font-mono text-xs"
              rows={4}
              value={settingsJson}
              onChange={(e) => setSettingsJson(e.target.value)}
            />
          </label>
          <Button variant="secondary" onClick={() => saveTenantSettings().catch((e) => setMsg(errMsg(e)))}>
            Save settings
          </Button>
        </Card>
      )}

      {tab === "seo" && (
        <Card className="mt-6 space-y-4">
          <div className="flex flex-wrap gap-2">
            <Input className="max-w-40" placeholder="term" value={term} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTerm(e.target.value)} />
            <Input
              className="min-w-64 flex-1"
              placeholder="synonyms comma-separated"
              value={synList}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSynList(e.target.value)}
            />
            <Button onClick={() => saveSynonym().catch((e) => setMsg(errMsg(e)))}>Save</Button>
            <Button variant="secondary" onClick={() => reindex().catch((e) => setMsg(errMsg(e)))}>
              Reindex search
            </Button>
          </div>
          <ul className="space-y-1 text-sm">
            {Object.entries(synonyms).map(([k, v]) => (
              <li key={k} className="flex items-center justify-between gap-2 rounded border px-3 py-2">
                <span>
                  <strong>{k}</strong>: {v.join(", ")}
                </span>
                <button type="button" className="text-xs text-rose-600" onClick={() => deleteSynonym(k).catch((e) => setMsg(errMsg(e)))}>
                  delete
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {tab === "payments" && (
        <Card className="mt-6">
          <p className="text-sm text-slate-500">Sandbox providers (read-only)</p>
          <ul className="mt-3 space-y-1">
            {providers.map((p) => (
              <li key={p} className="rounded border px-3 py-2">
                {p}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {tab === "payouts" && (
        <Card className="mt-6 space-y-3">
          <p className="text-sm text-slate-500">Aggregate unpaid payment_splits into vendor_payouts (sandbox).</p>
          <Button onClick={() => runPayouts().catch((e) => setMsg(errMsg(e)))}>Run vendor payouts</Button>
        </Card>
      )}

      {tab === "notifications" && (
        <Card className="mt-6 space-y-4">
          <div className="flex flex-wrap gap-2">
            <Input className="max-w-xs" placeholder="to" value={notifyTo} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNotifyTo(e.target.value)} />
            <Input className="min-w-64 flex-1" placeholder="body" value={notifyBody} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNotifyBody(e.target.value)} />
            <Button onClick={() => sendNotify().catch((e) => setMsg(errMsg(e)))}>Send</Button>
          </div>
          <h3 className="font-semibold">Outbox</h3>
          <ul className="space-y-1 text-sm">
            {outbox.map((n, i) => (
              <li key={n.id || i} className="rounded border px-3 py-2">
                {n.channel || "—"} · {n.status || "—"} · {n.subject || n.id || i}
              </li>
            ))}
            {outbox.length === 0 && <li className="text-slate-500">Empty outbox</li>}
          </ul>
        </Card>
      )}

      <Msg text={msg} />
      <Msg text={ok} tone="ok" />
    </div>
  );
}
