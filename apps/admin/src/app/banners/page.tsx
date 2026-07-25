"use client";

import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { Button, Card, Input } from "@gayrat/ui";
import { api, errMsg } from "@/lib/api";
import { EmptyState, Msg, PageHeader, SectionTabs, StatusBadge } from "@/components/ui";
import { useI18n } from "@/lib/i18n";

type BannerKind = "hero" | "promo";

type Banner = {
  id: string;
  kind?: BannerKind | string;
  image_url: string;
  cta_href?: string;
  sort_order?: number;
  active?: boolean;
  interval_sec?: number;
  starts_at?: string | null;
  ends_at?: string | null;
};

type FormState = {
  kind: BannerKind;
  image_url: string;
  cta_href: string;
  sort_order: number;
  active: boolean;
  interval_sec: number;
  starts_at: string;
  ends_at: string;
};

function toLocalInput(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string): string {
  return value.trim();
}

const emptyForm = (kind: BannerKind = "hero"): FormState => ({
  kind,
  image_url: "",
  cta_href: "",
  sort_order: 0,
  active: true,
  interval_sec: 6,
  starts_at: "",
  ends_at: "",
});

export default function BannersPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<Banner[]>([]);
  const [tab, setTab] = useState<BannerKind>("hero");
  const [form, setForm] = useState<FormState>(emptyForm("hero"));
  const [editId, setEditId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState("");
  const [uploading, setUploading] = useState(false);

  async function load() {
    const data = await api<{ items: Banner[] }>("/v1/admin/hero-banners?kind=all");
    setItems(data.items || []);
  }

  useEffect(() => {
    load().catch((e) => setMsg(errMsg(e)));
  }, []);

  const visible = useMemo(
    () => items.filter((b) => (b.kind || "hero") === tab),
    [items, tab]
  );

  function switchTab(next: BannerKind) {
    setTab(next);
    if (!editId) setForm(emptyForm(next));
  }

  function patch<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function payloadFromForm() {
    return {
      kind: form.kind || tab,
      image_url: form.image_url.trim(),
      cta_href: form.cta_href.trim(),
      // Image-only banners — clear legacy text/button fields
      headline: "",
      sub: "",
      cta_label: "",
      cta2_label: "",
      cta2_href: "",
      show_brand: false,
      sort_order: form.sort_order,
      active: form.active,
      interval_sec: form.interval_sec,
      starts_at: fromLocalInput(form.starts_at) || "",
      ends_at: fromLocalInput(form.ends_at) || "",
    };
  }

  async function uploadImage(file: File) {
    setUploading(true);
    setMsg("");
    try {
      const body = new FormData();
      body.append("file", file);
      const uploaded = await api<{ url: string; variants?: { webp?: string } }>("/v1/media/upload", {
        method: "POST",
        body,
      });
      patch("image_url", uploaded.variants?.webp || uploaded.url);
      setOk(t("bannersUploaded"));
    } catch (e) {
      setMsg(errMsg(e));
    } finally {
      setUploading(false);
    }
  }

  async function create() {
    setMsg("");
    if (!form.image_url.trim()) {
      setMsg(t("bannersImageRequired"));
      return;
    }
    await api("/v1/admin/hero-banners", {
      method: "POST",
      body: JSON.stringify(payloadFromForm()),
    });
    setForm(emptyForm(tab));
    setOk(t("bannersCreated"));
    await load();
  }

  async function saveEdit() {
    if (!editId) return;
    setMsg("");
    await api(`/v1/admin/hero-banners/${editId}`, {
      method: "PUT",
      body: JSON.stringify(payloadFromForm()),
    });
    setEditId(null);
    setForm(emptyForm(tab));
    setOk(t("bannersUpdated"));
    await load();
  }

  function startEdit(b: Banner) {
    const kind = ((b.kind as BannerKind) || "hero") === "promo" ? "promo" : "hero";
    setTab(kind);
    setEditId(b.id);
    setForm({
      kind,
      image_url: b.image_url || "",
      cta_href: b.cta_href || "",
      sort_order: b.sort_order || 0,
      active: b.active !== false,
      interval_sec: b.interval_sec && b.interval_sec > 0 ? b.interval_sec : 6,
      starts_at: toLocalInput(b.starts_at),
      ends_at: toLocalInput(b.ends_at),
    });
  }

  async function remove(id: string) {
    if (!confirm(t("bannersDeleteConfirm"))) return;
    await api(`/v1/admin/hero-banners/${id}`, { method: "DELETE" });
    setOk(t("bannersDeleted"));
    if (editId === id) {
      setEditId(null);
      setForm(emptyForm(tab));
    }
    await load();
  }

  async function toggleActive(b: Banner) {
    await api(`/v1/admin/hero-banners/${b.id}`, {
      method: "PUT",
      body: JSON.stringify({ active: !b.active }),
    });
    await load();
  }

  const isPromo = form.kind === "promo";

  const formFields = (
    <div className="mt-4 grid gap-3 md:grid-cols-2">
      <div className="md:col-span-2 flex flex-wrap gap-2">
        <button
          type="button"
          className={`rounded-xl px-3 py-1.5 text-sm font-semibold ${
            form.kind === "hero" ? "bg-teal text-white" : "bg-slate-100 text-slate-700"
          }`}
          onClick={() => patch("kind", "hero")}
          disabled={Boolean(editId)}
        >
          {t("bannersHero")}
        </button>
        <button
          type="button"
          className={`rounded-xl px-3 py-1.5 text-sm font-semibold ${
            form.kind === "promo" ? "bg-teal text-white" : "bg-slate-100 text-slate-700"
          }`}
          onClick={() => patch("kind", "promo")}
          disabled={Boolean(editId)}
        >
          {t("bannersPromo")}
        </button>
      </div>

      <div className="md:col-span-2 space-y-2">
        <label className="block text-sm font-medium">
          {t("bannersPhoto")}
          <input
            type="file"
            accept="image/*"
            className="mt-1 block w-full text-sm"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadImage(f);
            }}
          />
        </label>
        <Input
          placeholder={t("bannersImageUrl")}
          value={form.image_url}
          onChange={(e: ChangeEvent<HTMLInputElement>) => patch("image_url", e.target.value)}
        />
        {form.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={form.image_url}
            alt=""
            className="aspect-[3/2] w-full max-w-md rounded-xl bg-slate-900 object-cover"
          />
        ) : null}
      </div>

      <div className="md:col-span-2">
        <label className="block text-sm font-medium">
          {t("bannersLink")}
          <Input
            className="mt-1"
            placeholder={t("bannersLinkHint")}
            value={form.cta_href}
            onChange={(e: ChangeEvent<HTMLInputElement>) => patch("cta_href", e.target.value)}
          />
        </label>
        <p className="mt-1 text-xs text-slate-500">{t("bannersLinkHelp")}</p>
      </div>

      <label className="block text-sm font-medium">
        {t("bannersInterval")}
        <Input
          className="mt-1"
          type="number"
          min={2}
          max={120}
          value={form.interval_sec}
          onChange={(e: ChangeEvent<HTMLInputElement>) =>
            patch("interval_sec", Math.max(2, Math.min(120, Number(e.target.value) || 6)))
          }
        />
        <span className="mt-1 block text-xs text-slate-500">{t("bannersIntervalHelp")}</span>
      </label>

      <label className="block text-sm font-medium">
        {t("bannersSort")}
        <Input
          className="mt-1"
          type="number"
          value={form.sort_order}
          onChange={(e: ChangeEvent<HTMLInputElement>) => patch("sort_order", Number(e.target.value))}
        />
      </label>

      <label className="block text-sm font-medium">
        {t("bannersStarts")}
        <input
          type="datetime-local"
          className="mt-1 w-full rounded border px-3 py-2 text-sm"
          value={form.starts_at}
          onChange={(e) => patch("starts_at", e.target.value)}
        />
      </label>

      <label className="block text-sm font-medium">
        {t("bannersEnds")}
        <input
          type="datetime-local"
          className="mt-1 w-full rounded border px-3 py-2 text-sm"
          value={form.ends_at}
          onChange={(e) => patch("ends_at", e.target.value)}
        />
        <span className="mt-1 block text-xs text-slate-500">{t("bannersScheduleHelp")}</span>
      </label>

      <label className="flex items-center gap-2 text-sm md:col-span-2">
        <input type="checkbox" checked={form.active} onChange={(e) => patch("active", e.target.checked)} />
        {t("bannersActive")}
      </label>

      <p className="text-xs text-slate-500 md:col-span-2">
        {isPromo ? t("bannersPromoHint") : t("bannersHeroHint")}
      </p>

      <div className="flex flex-wrap gap-2 md:col-span-2">
        {editId ? (
          <>
            <Button onClick={() => saveEdit().catch((e) => setMsg(errMsg(e)))}>{t("commonSave")}</Button>
            <Button
              variant="ghost"
              onClick={() => {
                setEditId(null);
                setForm(emptyForm(tab));
              }}
            >
              {t("commonCancel")}
            </Button>
          </>
        ) : (
          <Button onClick={() => create().catch((e) => setMsg(errMsg(e)))} disabled={uploading}>
            {isPromo ? t("bannersAddPromo") : t("bannersAddHero")}
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <div>
      <PageHeader title={t("pageBannersTitle")} description={t("pageBannersDesc")} />
      <div className="mt-4">
        <SectionTabs
          items={[
            {
              id: "hero",
              label: `${t("bannersHero")} (${items.filter((b) => (b.kind || "hero") === "hero").length})`,
            },
            {
              id: "promo",
              label: `${t("bannersPromo")} (${items.filter((b) => b.kind === "promo").length})`,
            },
          ]}
          value={tab}
          onChange={(id) => switchTab(id as BannerKind)}
        />
      </div>
      <Card className="mt-4 p-4">{formFields}</Card>
      <Msg text={msg} />
      <Msg text={ok} tone="ok" />
      {visible.length === 0 ? (
        <div className="mt-6">
          <EmptyState text={tab === "hero" ? t("bannersEmptyHero") : t("bannersEmptyPromo")} />
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {visible.map((b) => (
            <li key={b.id}>
              <Card className="overflow-hidden p-0">
                <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-stretch">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={b.image_url}
                    alt=""
                    className="aspect-[3/2] w-full shrink-0 rounded-lg bg-slate-900 object-cover sm:w-56"
                  />
                  <div className="min-w-0 flex-1 space-y-1.5 px-1 py-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={b.active ? "active" : "draft"} />
                      <span className="text-xs text-slate-400">{b.kind || "hero"}</span>
                      <span className="text-xs text-slate-400">#{b.sort_order ?? 0}</span>
                      <span className="text-xs text-slate-400">
                        {b.interval_sec || 6}s
                      </span>
                    </div>
                    <p className="truncate text-sm font-semibold text-slate-900">
                      {b.cta_href || t("bannersNoLink")}
                    </p>
                    {(b.starts_at || b.ends_at) && (
                      <p className="text-xs text-slate-500">
                        {b.starts_at ? toLocalInput(b.starts_at).replace("T", " ") : "…"}
                        {" → "}
                        {b.ends_at ? toLocalInput(b.ends_at).replace("T", " ") : "…"}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2 pt-1">
                      <button type="button" className="text-xs font-semibold text-teal" onClick={() => startEdit(b)}>
                        {t("commonEdit")}
                      </button>
                      <button
                        type="button"
                        className="text-xs font-semibold text-slate-600"
                        onClick={() => toggleActive(b).catch((e) => setMsg(errMsg(e)))}
                      >
                        {b.active ? t("commonDisable") : t("commonEnable")}
                      </button>
                      <button
                        type="button"
                        className="text-xs font-semibold text-rose-600"
                        onClick={() => remove(b.id).catch((e) => setMsg(errMsg(e)))}
                      >
                        {t("commonDelete")}
                      </button>
                    </div>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
