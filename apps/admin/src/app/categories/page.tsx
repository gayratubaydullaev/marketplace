"use client";

import { useEffect, useState } from "react";
import { Button, Input } from "@gayrat/ui";
import { api, errMsg } from "@/lib/api";
import { EmptyState, Msg, PageHeader, PanelCard } from "@/components/ui";
import { useI18n } from "@/lib/i18n";

type Category = {
  id: string;
  slug: string;
  parent_id?: string | null;
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
  const [attrs, setAttrs] = useState('[{"slug":"color","type":"text"}]');
  const [editId, setEditId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  async function load() {
    const data = await api<{ items: Category[] }>("/v1/categories");
    setItems(data.items || []);
  }

  useEffect(() => {
    load().catch((e) => setMsg(errMsg(e)));
  }, []);

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
      }),
    });
    setSlug("");
    setNameUz("");
    setNameRu("");
    setParentId("");
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
      }),
    });
    setEditId(null);
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
  }

  const roots = items.filter((c) => !c.parent_id);
  const childrenOf = (id: string) => items.filter((c) => c.parent_id === id);

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
              <Input value={nameUz} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNameUz(e.target.value)} placeholder="uz" />
              <Input value={nameRu} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNameRu(e.target.value)} placeholder="ru" />
              <select className="rounded border px-2 py-2 text-sm" value={parentId} onChange={(e) => setParentId(e.target.value)}>
                <option value="">No parent</option>
                {items.filter((x) => x.id !== c.id).map((x) => (
                  <option key={x.id} value={x.id}>
                    {catName(x)}
                  </option>
                ))}
              </select>
              <Button onClick={() => saveEdit(c).catch((e) => setMsg(errMsg(e)))}>Save</Button>
              <Button variant="ghost" onClick={() => setEditId(null)}>
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
          <Input placeholder="slug" value={slug} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSlug(e.target.value)} />
          <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm" value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">No parent</option>
            {items.map((c) => (
              <option key={c.id} value={c.id}>
                {catName(c)}
              </option>
            ))}
          </select>
          <Input placeholder="name uz" value={nameUz} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNameUz(e.target.value)} />
          <Input placeholder="name ru" value={nameRu} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNameRu(e.target.value)} />
          <textarea
            className="rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs md:col-span-2"
            rows={3}
            value={attrs}
            onChange={(e) => setAttrs(e.target.value)}
          />
          <div className="md:col-span-2">
            <Button onClick={() => create().catch((e) => setMsg(errMsg(e)))}>Add category</Button>
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
