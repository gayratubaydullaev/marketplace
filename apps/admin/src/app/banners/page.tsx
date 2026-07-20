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
  headline?: string;
  sub?: string;
  cta_label?: string;
  cta_href?: string;
  cta2_label?: string;
  cta2_href?: string;
  sort_order?: number;
  active?: boolean;
  show_brand?: boolean;
};

type FormState = {
  kind: BannerKind;
  image_url: string;
  headline: string;
  sub: string;
  cta_label: string;
  cta_href: string;
  cta2_label: string;
  cta2_href: string;
  sort_order: number;
  active: boolean;
  show_brand: boolean;
};

const emptyForm = (kind: BannerKind = "hero"): FormState => ({
  kind,
  image_url: "",
  headline: "",
  sub: "",
  cta_label: "",
  cta_href: "",
  cta2_label: "",
  cta2_href: "",
  sort_order: 0,
  active: true,
  show_brand: kind === "hero",
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
      setOk("Image uploaded");
    } catch (e) {
      setMsg(errMsg(e));
    } finally {
      setUploading(false);
    }
  }

  async function create() {
    setMsg("");
    if (!form.image_url.trim()) {
      setMsg("Image is required");
      return;
    }
    await api("/v1/admin/hero-banners", {
      method: "POST",
      body: JSON.stringify({ ...form, kind: form.kind || tab }),
    });
    setForm(emptyForm(tab));
    setOk("Banner created");
    await load();
  }

  async function saveEdit() {
    if (!editId) return;
    setMsg("");
    await api(`/v1/admin/hero-banners/${editId}`, {
      method: "PUT",
      body: JSON.stringify(form),
    });
    setEditId(null);
    setForm(emptyForm(tab));
    setOk("Banner updated");
    await load();
  }

  function startEdit(b: Banner) {
    const kind = ((b.kind as BannerKind) || "hero") === "promo" ? "promo" : "hero";
    setTab(kind);
    setEditId(b.id);
    setForm({
      kind,
      image_url: b.image_url || "",
      headline: b.headline || "",
      sub: b.sub || "",
      cta_label: b.cta_label || "",
      cta_href: b.cta_href || "",
      cta2_label: b.cta2_label || "",
      cta2_href: b.cta2_href || "",
      sort_order: b.sort_order || 0,
      active: b.active !== false,
      show_brand: b.show_brand !== false,
    });
  }

  async function remove(id: string) {
    if (!confirm("Delete this banner?")) return;
    await api(`/v1/admin/hero-banners/${id}`, { method: "DELETE" });
    setOk("Deleted");
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
          placeholder="Or paste image URL"
          value={form.image_url}
          onChange={(e: ChangeEvent<HTMLInputElement>) => patch("image_url", e.target.value)}
        />
        {form.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={form.image_url} alt="" className="h-28 w-full max-w-md rounded-xl object-cover" />
        ) : null}
      </div>
      {!isPromo ? (
        <label className="flex items-center gap-2 text-sm md:col-span-2">
          <input
            type="checkbox"
            checked={form.show_brand}
            onChange={(e) => patch("show_brand", e.target.checked)}
          />
          {t("bannersShowBrand")}
        </label>
      ) : null}
      <Input
        placeholder={isPromo ? "Title (optional)" : "Headline (optional)"}
        value={form.headline}
        onChange={(e: ChangeEvent<HTMLInputElement>) => patch("headline", e.target.value)}
      />
      <Input
        placeholder="Sort order"
        type="number"
        value={form.sort_order}
        onChange={(e: ChangeEvent<HTMLInputElement>) => patch("sort_order", Number(e.target.value))}
      />
      <textarea
        className="min-h-[72px] rounded border px-3 py-2 text-sm md:col-span-2"
        placeholder="Subtitle (optional — leave empty for photo only)"
        value={form.sub}
        onChange={(e) => patch("sub", e.target.value)}
      />
      <Input
        placeholder={isPromo ? "Button label (optional)" : "Button 1 label (optional)"}
        value={form.cta_label}
        onChange={(e: ChangeEvent<HTMLInputElement>) => patch("cta_label", e.target.value)}
      />
      <Input
        placeholder="Button link e.g. /products"
        value={form.cta_href}
        onChange={(e: ChangeEvent<HTMLInputElement>) => patch("cta_href", e.target.value)}
      />
      {!isPromo ? (
        <>
          <Input
            placeholder="Button 2 label (optional)"
            value={form.cta2_label}
            onChange={(e: ChangeEvent<HTMLInputElement>) => patch("cta2_label", e.target.value)}
          />
          <Input
            placeholder="Button 2 link"
            value={form.cta2_href}
            onChange={(e: ChangeEvent<HTMLInputElement>) => patch("cta2_href", e.target.value)}
          />
        </>
      ) : null}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={form.active} onChange={(e) => patch("active", e.target.checked)} />
        Active
      </label>
      <p className="text-xs text-slate-500 md:col-span-2">
        {isPromo
          ? "Promo banner appears below categories. Leave text/button empty for image-only ad."
          : "Hero slides replace the default homepage carousel once at least one active hero exists."}
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
                    className="h-28 w-full shrink-0 rounded-lg object-cover sm:h-auto sm:w-44"
                  />
                  <div className="min-w-0 flex-1 space-y-1.5 px-1 py-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={b.active ? "active" : "draft"} />
                      <span className="text-xs text-slate-400">{b.kind || "hero"}</span>
                      <span className="text-xs text-slate-400">order {b.sort_order ?? 0}</span>
                    </div>
                    <p className="font-semibold text-slate-900">
                      {b.headline || (b.sub ? "—" : "Photo only")}
                    </p>
                    {b.sub ? <p className="line-clamp-2 text-sm text-slate-600">{b.sub}</p> : null}
                    <p className="text-xs text-slate-500">
                      {[b.cta_label && `Btn: ${b.cta_label}`, b.cta2_label && `Btn2: ${b.cta2_label}`]
                        .filter(Boolean)
                        .join(" · ") || "No buttons"}
                    </p>
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
