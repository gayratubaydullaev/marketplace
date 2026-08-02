"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Input, Card } from "@gayrat/ui";
import { api, errMsg, TENANT } from "@/lib/api";
import { Msg, PageHeader, SectionTabs } from "@/components/ui";
import { useI18n } from "@/lib/i18n";

type Tab = "mode" | "seo" | "payments" | "payouts" | "notifications";

type ProviderHealth = {
  sandbox?: boolean;
  currency?: string;
  providers?: { name: string; configured: boolean; manual?: boolean; env?: Record<string, boolean> }[];
};

type TenantSettings = {
  currency?: string;
  default_locale?: string;
  tax_rate?: number;
  default_commission_rate?: number;
};

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
  const [providerHealth, setProviderHealth] = useState<ProviderHealth | null>(null);
  const [outbox, setOutbox] = useState<{ id?: string; channel?: string; status?: string; subject?: string }[]>([]);
  const [notifyTo, setNotifyTo] = useState("");
  const [notifyBody, setNotifyBody] = useState("");
  const [settings, setSettings] = useState<TenantSettings>({ currency: "UZS", default_locale: "uz", tax_rate: 0, default_commission_rate: 10 });
  const [settingsJson, setSettingsJson] = useState("");
  const [searchHealth, setSearchHealth] = useState<{ elasticsearch?: { available?: boolean }; search_backend?: string } | null>(null);

  useEffect(() => {
    api<{ mode?: string; settings?: TenantSettings }>("/v1/admin/tenant/settings")
      .then((d) => {
        if (d.mode) setMode(d.mode);
        const s = d.settings || { currency: "UZS", default_locale: "uz" };
        setSettings({
          currency: s.currency || "UZS",
          default_locale: s.default_locale || "uz",
          tax_rate: Number(s.tax_rate ?? 0),
          default_commission_rate: Number(s.default_commission_rate ?? 10),
        });
        setSettingsJson(JSON.stringify(s, null, 2));
      })
      .catch(() => {
        api<{ mode?: string }>("/v1/tenant/mode")
          .then(({ mode: currentMode }) => setMode(currentMode || "multi_vendor"))
          .catch(() => undefined);
      });
    api<{ synonyms?: Record<string, string[]> }>("/v1/search/synonyms")
      .then((d) => setSynonyms(d.synonyms || {}))
      .catch(() => undefined);
    api<{ providers?: string[]; items?: string[] }>("/v1/payments/providers")
      .then((d) => setProviders(d.providers || d.items || ["payme", "click", "uzum", "stripe", "bank_transfer"]))
      .catch(() => setProviders(["payme", "click", "uzum", "stripe", "bank_transfer"]));
    api<ProviderHealth>("/v1/payments/providers/health")
      .then((d) => setProviderHealth(d))
      .catch(() => setProviderHealth(null));
    api<{ elasticsearch?: { available?: boolean }; search_backend?: string }>("/v1/search/health")
      .then((d) => setSearchHealth(d))
      .catch(() => setSearchHealth(null));
  }, []);

  useEffect(() => {
    if (tab !== "notifications") return;
    api<{ items?: typeof outbox }>("/v1/notifications/outbox")
      .then((d) => setOutbox(d.items || []))
      .catch(() => setOutbox([]));
  }, [tab]);

  const outboxStats = useMemo(() => {
    const stats: Record<string, number> = {};
    for (const row of outbox) {
      const key = row.status || "unknown";
      stats[key] = (stats[key] || 0) + 1;
    }
    return stats;
  }, [outbox]);

  async function switchMode() {
    setMsg("");
    await api("/v1/admin/tenant/mode", { method: "POST", body: JSON.stringify({ mode }) });
    setOk(t("settingsModeSaved"));
  }

  async function saveTenantSettings() {
    setMsg("");
    const body: TenantSettings = {
      ...settings,
      tax_rate: Number(settings.tax_rate ?? 0),
      default_commission_rate: Number(settings.default_commission_rate ?? 10),
    };
    await api("/v1/admin/tenant/settings", { method: "PUT", body: JSON.stringify(body) });
    setSettingsJson(JSON.stringify(body, null, 2));
    setOk(t("settingsSaved"));
  }

  async function saveTenantSettingsJson() {
    setMsg("");
    let body: unknown = {};
    try {
      body = JSON.parse(settingsJson);
    } catch {
      setMsg(t("settingsJsonInvalid"));
      return;
    }
    await api("/v1/admin/tenant/settings", { method: "PUT", body: JSON.stringify(body) });
    if (body && typeof body === "object") {
      const s = body as TenantSettings;
      setSettings({
        currency: s.currency || "UZS",
        default_locale: s.default_locale || "uz",
        tax_rate: Number(s.tax_rate ?? 0),
        default_commission_rate: Number(s.default_commission_rate ?? 10),
      });
    }
    setOk(t("settingsSaved"));
  }

  async function runPayouts() {
    setMsg("");
    const r = await api<{ payouts_created?: number; created?: number }>("/v1/admin/payouts/run", { method: "POST" });
    setOk(t("settingsPayoutsRun", { n: String(r.payouts_created ?? r.created ?? 0) }));
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
    setOk(t("settingsSynonymSaved"));
  }

  async function deleteSynonym(termKey: string) {
    setMsg("");
    await api(`/v1/search/synonyms/${encodeURIComponent(termKey)}`, { method: "DELETE" });
    const d = await api<{ synonyms?: Record<string, string[]> }>("/v1/search/synonyms");
    setSynonyms(d.synonyms || {});
    setOk(t("settingsSynonymDeleted"));
  }

  async function reindex() {
    setMsg("");
    const r = await api<{ indexed?: number }>("/v1/search/reindex", { method: "POST" });
    setOk(t("settingsReindexed", { n: String(r.indexed ?? 0) }));
  }

  async function sendNotify() {
    setMsg("");
    await api("/v1/notifications/test-send", {
      method: "POST",
      body: JSON.stringify({ to: notifyTo, body: notifyBody, channel: "email", subject: "Gayrat admin test" }),
    });
    setOk(t("settingsNotifyQueued"));
    setNotifyBody("");
  }

  const esDown = searchHealth != null && searchHealth.elasticsearch?.available === false;

  const tabs: { id: Tab; label: string }[] = [
    { id: "mode", label: t("settingsTabMode") },
    { id: "seo", label: t("settingsTabSeo") },
    { id: "payments", label: t("settingsTabPayments") },
    { id: "payouts", label: t("settingsTabPayouts") },
    { id: "notifications", label: t("settingsTabNotifications") },
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
            {t("settingsTenantMode")}
            <select className="mt-1 block rounded border px-3 py-2" value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="multi_vendor">multi_vendor</option>
              <option value="single_store">single_store</option>
            </select>
          </label>
          <Button onClick={() => switchMode().catch((e) => setMsg(errMsg(e)))}>{t("settingsSaveMode")}</Button>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              {t("settingsTaxRate")} (%)
              <Input
                type="number"
                className="mt-1"
                step="0.1"
                value={settings.tax_rate ?? 0}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setSettings((s) => ({ ...s, tax_rate: Number(e.target.value) }))
                }
              />
            </label>
            <label className="block text-sm">
              {t("settingsDefaultCommission")} (%)
              <Input
                type="number"
                className="mt-1"
                step="0.1"
                value={settings.default_commission_rate ?? 10}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setSettings((s) => ({ ...s, default_commission_rate: Number(e.target.value) }))
                }
              />
            </label>
            <label className="block text-sm">
              {t("settingsCurrency")}
              <Input
                className="mt-1"
                value={settings.currency || "UZS"}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSettings((s) => ({ ...s, currency: e.target.value }))}
              />
            </label>
            <label className="block text-sm">
              {t("settingsDefaultLocale")}
              <Input
                className="mt-1"
                value={settings.default_locale || "uz"}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSettings((s) => ({ ...s, default_locale: e.target.value }))}
              />
            </label>
          </div>
          <Button variant="secondary" onClick={() => saveTenantSettings().catch((e) => setMsg(errMsg(e)))}>
            {t("settingsSaveTenant")}
          </Button>

          <label className="block text-sm">
            {t("settingsJsonAdvanced")}
            <textarea
              className="mt-1 w-full rounded border px-3 py-2 font-mono text-xs"
              rows={6}
              value={settingsJson}
              onChange={(e) => setSettingsJson(e.target.value)}
            />
          </label>
          <Button variant="secondary" onClick={() => saveTenantSettingsJson().catch((e) => setMsg(errMsg(e)))}>
            {t("settingsSaveJson")}
          </Button>
        </Card>
      )}

      {tab === "seo" && (
        <Card className="mt-6 space-y-4">
          {esDown && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" role="status">
              {t("settingsEsFallback", { backend: searchHealth?.search_backend || "postgres" })}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Input className="max-w-40" placeholder={t("settingsSynonymTerm")} value={term} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTerm(e.target.value)} />
            <Input
              className="min-w-64 flex-1"
              placeholder={t("settingsSynonymList")}
              value={synList}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSynList(e.target.value)}
            />
            <Button onClick={() => saveSynonym().catch((e) => setMsg(errMsg(e)))}>{t("commonSave")}</Button>
            <Button variant="secondary" onClick={() => reindex().catch((e) => setMsg(errMsg(e)))}>
              {t("settingsReindex")}
            </Button>
          </div>
          <ul className="space-y-1 text-sm">
            {Object.entries(synonyms).map(([k, v]) => (
              <li key={k} className="flex items-center justify-between gap-2 rounded border px-3 py-2">
                <span>
                  <strong>{k}</strong>: {v.join(", ")}
                </span>
                <button type="button" className="text-xs text-rose-600" onClick={() => deleteSynonym(k).catch((e) => setMsg(errMsg(e)))}>
                  {t("commonDelete")}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {tab === "payments" && (
        <Card className="mt-6 space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-slate-500">{t("settingsSandbox")}:</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${providerHealth?.sandbox ? "bg-amber-100 text-amber-800" : "bg-teal/15 text-teal"}`}>
              {providerHealth?.sandbox ? t("settingsOn") : providerHealth ? t("settingsOff") : "—"}
            </span>
          </div>
          {providerHealth?.providers ? (
            <ul className="space-y-2">
              {providerHealth.providers.map((p) => (
                <li key={p.name} className="rounded border px-3 py-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{p.name}</span>
                    <span className={`text-xs font-semibold ${p.configured ? "text-teal" : "text-rose-600"}`}>
                      {p.manual ? t("settingsManual") : p.configured ? t("settingsConfigured") : t("settingsMissingSecrets")}
                    </span>
                  </div>
                  {p.env && Object.keys(p.env).length > 0 && (
                    <ul className="mt-1 flex flex-wrap gap-1">
                      {Object.entries(p.env).map(([key, present]) => (
                        <li key={key} className={`rounded px-1.5 py-0.5 text-[10px] ${present ? "bg-teal/10 text-teal" : "bg-slate-100 text-slate-400"}`}>
                          {key}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <ul className="space-y-1">
              {providers.map((p) => (
                <li key={p} className="rounded border px-3 py-2">
                  {p}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === "payouts" && (
        <Card className="mt-6 space-y-3">
          <p className="text-sm text-slate-500">{t("settingsPayoutsHint")}</p>
          <Button onClick={() => runPayouts().catch((e) => setMsg(errMsg(e)))}>{t("settingsRunPayouts")}</Button>
        </Card>
      )}

      {tab === "notifications" && (
        <Card className="mt-6 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            <p className="font-semibold">{t("settingsNotifyTransport")}</p>
            <p className="mt-1 text-slate-600">{t("settingsNotifyTransportHint")}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {Object.entries(outboxStats).map(([status, count]) => (
                <span key={status} className="rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold ring-1 ring-slate-200">
                  {status}: {count}
                </span>
              ))}
              {Object.keys(outboxStats).length === 0 && <span className="text-xs text-slate-500">{t("settingsOutboxEmpty")}</span>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Input className="max-w-xs" placeholder={t("settingsNotifyTo")} value={notifyTo} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNotifyTo(e.target.value)} />
            <Input className="min-w-64 flex-1" placeholder={t("settingsNotifyBody")} value={notifyBody} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNotifyBody(e.target.value)} />
            <Button onClick={() => sendNotify().catch((e) => setMsg(errMsg(e)))}>{t("settingsNotifyTest")}</Button>
          </div>
          <h3 className="font-semibold">{t("settingsOutbox")}</h3>
          <ul className="space-y-1 text-sm">
            {outbox.map((n, i) => (
              <li key={n.id || i} className="rounded border px-3 py-2">
                {n.channel || "—"} · {n.status || "—"} · {n.subject || n.id || i}
              </li>
            ))}
            {outbox.length === 0 && <li className="text-slate-500">{t("settingsOutboxEmpty")}</li>}
          </ul>
        </Card>
      )}

      <Msg text={msg} />
      <Msg text={ok} tone="ok" />
    </div>
  );
}
