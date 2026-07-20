"use client";

import { useEffect, useState } from "react";
import { Button, Input } from "@gayrat/ui";
import { Field, Msg, PageHeader, PanelCard, StatusBadge } from "@/components/ui";
import { STOREFRONT_URL, api, errMsg } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

type Settings = {
  id?: string;
  name?: string;
  slug?: string;
  description?: string;
  logo_url?: string | null;
  status?: string;
  bank_name?: string;
  bank_account?: string;
  policies?: string;
  kyc_documents?: string[] | unknown;
};

function asURLs(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

export default function VendorSettings() {
  const { t, locale } = useI18n();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [logoURL, setLogoURL] = useState("");
  const [status, setStatus] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [policies, setPolicies] = useState("");
  const [kycDocuments, setKycDocuments] = useState<string[]>([]);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState("");

  async function load() {
    const s = await api<Settings>("/v1/vendor/settings");
    setName(s.name || "");
    setSlug(s.slug || "");
    setDescription(s.description || "");
    setLogoURL(typeof s.logo_url === "string" ? s.logo_url : "");
    setStatus(s.status || "");
    setBankName(String(s.bank_name || ""));
    setBankAccount(String(s.bank_account || ""));
    setPolicies(String(s.policies || ""));
    setKycDocuments(asURLs(s.kyc_documents));
  }

  useEffect(() => {
    load().catch((e) => setMsg(errMsg(e)));
  }, []);

  async function save() {
    setMsg("");
    setOk("");
    await api("/v1/vendor/settings", {
      method: "PUT",
      body: JSON.stringify({
        name,
        description,
        logo_url: logoURL || null,
        bank_name: bankName,
        bank_account: bankAccount,
        policies,
        kyc_documents: kycDocuments,
      }),
    });
    setOk("Сохранено");
    await load();
  }

  async function uploadFile(file: File, kind: "logo" | "kyc") {
    setMsg("");
    const form = new FormData();
    form.append("file", file);
    const uploaded = await api<{ url: string }>("/v1/media/upload", { method: "POST", body: form });
    if (kind === "logo") {
      setLogoURL(uploaded.url);
      setOk("Лого загружено — нажмите Save");
    } else {
      setKycDocuments((docs) => [...docs, uploaded.url]);
      setOk("KYC документ загружен — нажмите Save");
    }
  }

  const storefront = slug ? `${STOREFRONT_URL}/${locale}/vendors/${slug}` : "";

  return (
    <div>
      <PageHeader
        title={t("pageSettingsTitle")}
        description={t("pageSettingsDesc")}
        actions={status ? <StatusBadge status={status} /> : null}
      />
      <Msg text={msg} />
      <Msg text={ok} tone="ok" />

      <div className="mt-2 max-w-lg space-y-4">
        <PanelCard className="space-y-4">
        <Field label="Название">
          <Input value={name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)} />
        </Field>
        <Field label="Slug">
          <Input value={slug} disabled className="opacity-70" />
        </Field>
        {storefront ? (
          <a href={storefront} target="_blank" rel="noreferrer" className="block text-sm font-medium text-teal hover:underline">
            Открыть витрину →
          </a>
        ) : null}
        <Field label="Описание">
          <textarea
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <Field label="Logo">
          <div className="flex flex-wrap items-center gap-3">
            {logoURL ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoURL} alt="" className="h-14 w-14 rounded-lg object-cover" />
            ) : null}
            <input
              type="file"
              accept="image/*"
              className="text-sm"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadFile(f, "logo").catch((err) => setMsg(errMsg(err)));
              }}
            />
          </div>
        </Field>
        <Field label="Банк">
          <Input placeholder="Bank name" value={bankName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBankName(e.target.value)} />
        </Field>
        <Field label="Счёт">
          <Input placeholder="Bank account" value={bankAccount} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBankAccount(e.target.value)} />
        </Field>
        <Field label="Политики">
          <textarea
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            rows={4}
            placeholder="Доставка, возврат…"
            value={policies}
            onChange={(e) => setPolicies(e.target.value)}
          />
        </Field>
        <Field label="KYC documents">
          <input
            type="file"
            className="text-sm"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadFile(f, "kyc").catch((err) => setMsg(errMsg(err)));
            }}
          />
          {kycDocuments.length > 0 ? (
            <ul className="mt-2 space-y-1 text-xs text-slate-600">
              {kycDocuments.map((u) => (
                <li key={u} className="truncate">
                  <a href={u} target="_blank" rel="noreferrer" className="text-teal hover:underline">
                    {u}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-xs text-slate-400">Документы ещё не загружены</p>
          )}
        </Field>
        <Button onClick={() => save().catch((e) => setMsg(errMsg(e)))}>{t("commonSave")}</Button>
        </PanelCard>
      </div>
    </div>
  );
}
