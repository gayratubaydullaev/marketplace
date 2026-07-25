"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { Button, Input } from "@gayrat/ui";
import { api, errMsg } from "@/lib/api";
import { EmptyState, Msg, PageHeader, PanelCard } from "@/components/ui";
import { useI18n } from "@/lib/i18n";

type Category = {
  id: string;
  slug: string;
  parent_id?: string | null;
  image_url?: string | null;
  translations: Record<string, { name?: string }> | unknown;
  sort_order?: number;
};

function catName(c: Category, locale = "uz"): string {
  const t = c.translations as Record<string, { name?: string }> | undefined;
  return t?.[locale]?.name || c.slug;
}

export default function CategoriesPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<Category[]>([]);
  const [slug, setSlug] = useState("");
  const [nameUz, setNameUz] = useState("");
  const [nameRu, setNameRu] = useState("");
  const [parentId, setParentId] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [attrs, setAttrs] = useState('[{"slug":"color","type":"text"}]');
  const [editId, setEditId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState("");
  const [uploading, setUploading] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  async function load() {
    const data = await api<{ items: Category[] }>("/v1/categories");
    setItems(data.items || []);
  }

  useEffect(() => {
    load().catch((e) => setMsg(errMsg(e)));
  }, []);

  function resetForm() {
    setSlug("");
    setNameUz("");
    setNameRu("");
    setParentId("");
    setImageUrl("");
    setEditId(null);
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
      setImageUrl(uploaded.variants?.webp || uploaded.url);
      setOk("Image uploaded");
    } catch (e) {
      setMsg(errMsg(e));
    } finally {
      setUploading(false);
    }
  }

  async function create() {
    setMsg("");
    let attributes_schema: unknown = [];
    try {
      attributes_schema = JSON.parse(attrs || "[]");
    } catch {
      setMsg("Invalid attributes JSON");
      return;
    }
    await api("/v1/categories", {
      method: "POST",
      body: JSON.stringify({
        slug,
        parent_id: parentId || null,
        translations: { uz: { name: nameUz }, ru: { name: nameRu } },
        sort_order: items.length + 1,
        attributes_schema,
        image_url: imageUrl.trim() || null,
      }),
    });
    resetForm();
    setOk("Category created");
    await load();
  }

  async function saveEdit(c: Category) {
    setMsg("");
    await api(`/v1/categories/${c.id}`, {
      method: "PUT",
      body: JSON.stringify({
        parent_id: parentId || null,
        translations: { uz: { name: nameUz }, ru: { name: nameRu } },
        sort_order: c.sort_order || 0,
        image_url: imageUrl.trim(),
      }),
    });
    resetForm();
    setOk("Category updated");
    await load();
  }

  async function remove(id: string) {
    if (!confirm("Archive this category?")) return;
    setMsg("");
    await api(`/v1/categories/${id}`, { method: "DELETE" });
    setOk("Category archived");
    await load();
  }

  function startEdit(c: Category) {
    setEditId(c.id);
    setNameUz(catName(c, "uz"));
    setNameRu(catName(c, "ru"));
    setParentId(c.parent_id || "");
    setImageUrl(c.image_url || "");
    setSlug(c.slug);
  }

  const roots = items.filter((c) => !c.parent_id);
  const childrenOf = (id: string) => items.filter((c) => c.parent_id === id);

  function imageField() {
    return (
      <div className="space-y-2 md:col-span-2">
        <label className="block text-sm font-medium text-slate-700">
          Category image
          <input
            type="file"
            accept="image/*"
            disabled={uploading}
            className="mt-1.5 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-teal/10 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-teal"
            onChange={(e: ChangeEvent<HTMLInputElement>) => {
              const file = e.target.files?.[0];
              if (file) void uploadImage(file);
              e.target.value = "";
            }}
          />
        </label>
        <Input
          placeholder="or paste image URL"
          value={imageUrl}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setImageUrl(e.target.value)}
        />
        {imageUrl ? (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="" className="h-16 w-24 rounded-lg object-cover ring-1 ring-slate-200" />
            <button
              type="button"
              className="text-xs font-semibold text-rose-600"
              onClick={() => setImageUrl("")}
            >
              Remove image
            </button>
            {uploading ? <span className="text-xs text-slate-400">Uploading…</span> : null}
          </div>
        ) : uploading ? (
          <p className="text-xs text-slate-400">Uploading…</p>
        ) : null}
      </div>
    );
  }

  function renderTree(cats: Category[], depth = 0): React.ReactNode {
    return cats.map((c) => {
      const kids = childrenOf(c.id);
      const isCollapsed = collapsed[c.id];
      return (
        <li key={c.id} className="rounded border bg-white px-4 py-3" style={{ marginLeft: depth * 16 }}>
          <div className="flex flex-wrap items-center gap-2">
            {kids.length > 0 && (
              <button
                type="button"
                className="text-xs text-slate-400"
                onClick={() => setCollapsed((s) => ({ ...s, [c.id]: !s[c.id] }))}
              >
                {isCollapsed ? "+" : "−"}
              </button>
            )}
            {c.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.image_url} alt="" className="h-9 w-12 rounded object-cover ring-1 ring-slate-200" />
            ) : (
              <span className="flex h-9 w-12 items-center justify-center rounded bg-slate-100 text-[10px] text-slate-400">
                —
              </span>
            )}
            <span className="font-semibold">{catName(c, "uz")}</span>
            <span className="text-slate-500">/ {catName(c, "ru")}</span>
            <span className="font-mono text-xs text-slate-400">{c.slug}</span>
            <button type="button" className="text-xs text-teal" onClick={() => startEdit(c)}>
              edit
            </button>
            <button type="button" className="text-xs text-rose-600" onClick={() => remove(c.id).catch((e) => setMsg(errMsg(e)))}>
              delete
            </button>
          </div>
          {editId === c.id && (
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              <Input value={nameUz} onChange={(e: ChangeEvent<HTMLInputElement>) => setNameUz(e.target.value)} placeholder="uz" />
              <Input value={nameRu} onChange={(e: ChangeEvent<HTMLInputElement>) => setNameRu(e.target.value)} placeholder="ru" />
              <select className="rounded border px-2 py-2 text-sm" value={parentId} onChange={(e) => setParentId(e.target.value)}>
                <option value="">No parent</option>
                {items.filter((x) => x.id !== c.id).map((x) => (
                  <option key={x.id} value={x.id}>
                    {catName(x)}
                  </option>
                ))}
              </select>
              {imageField()}
              <Button onClick={() => saveEdit(c).catch((e) => setMsg(errMsg(e)))}>Save</Button>
              <Button variant="ghost" onClick={() => resetForm()}>
                Cancel
              </Button>
            </div>
          )}
          {!isCollapsed && kids.length > 0 && <ul className="mt-2 space-y-2">{renderTree(kids, depth + 1)}</ul>}
        </li>
      );
    });
  }

  return (
    <div>
      <PageHeader title={t("pageCategoriesTitle")} description={t("pageCategoriesDesc")} />
      <PanelCard className="mt-4">
        <div className="grid gap-3 md:grid-cols-2">
          <Input placeholder="slug" value={slug} onChange={(e: ChangeEvent<HTMLInputElement>) => setSlug(e.target.value)} disabled={Boolean(editId)} />
          <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">No parent</option>
            {items.map((c) => (
              <option key={c.id} value={c.id}>
                {catName(c)}
              </option>
            ))}
          </select>
          <Input placeholder="name uz" value={nameUz} onChange={(e: ChangeEvent<HTMLInputElement>) => setNameUz(e.target.value)} />
          <Input placeholder="name ru" value={nameRu} onChange={(e: ChangeEvent<HTMLInputElement>) => setNameRu(e.target.value)} />
          {imageField()}
          <textarea
            className="rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs md:col-span-2"
            rows={3}
            value={attrs}
            onChange={(e) => setAttrs(e.target.value)}
          />
          <div className="md:col-span-2">
            {editId ? (
              <p className="text-sm text-slate-500">Editing — use Save in the tree row below, or Cancel.</p>
            ) : (
              <Button onClick={() => create().catch((e) => setMsg(errMsg(e)))} disabled={uploading}>
                Add category
              </Button>
            )}
          </div>
        </div>
      </PanelCard>
      <Msg text={msg} />
      <Msg text={ok} tone="ok" />
      {items.length === 0 ? (
        <div className="mt-6">
          <EmptyState text="No categories" />
        </div>
      ) : (
        <ul className="mt-6 space-y-2">{renderTree(roots.length ? roots : items)}</ul>
      )}
    </div>
  );
}
