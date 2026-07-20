"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button, Input } from "@gayrat/ui";
import { api, errMsg } from "@/lib/api";
import { EmptyState, Msg, PageHeader, Pagination, Select, StatusBadge, TableShell } from "@/components/ui";
import { useI18n } from "@/lib/i18n";

type Product = {
  id: string;
  slug: string;
  price: number;
  status: string;
  inventory_quantity?: number;
  translations?: Record<string, { name?: string }>;
};

type Category = { id: string; slug: string; translations?: Record<string, { name?: string }> };

const PAGE_SIZE = 20;

export default function VendorProducts() {
  const { t } = useI18n();
  const [items, setItems] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState(250000);
  const [categoryId, setCategoryId] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState("");

  async function load() {
    const [prod, cats] = await Promise.all([
      api<{ items: Product[] }>("/v1/vendor/products"),
      api<{ items: Category[] }>("/v1/categories"),
    ]);
    setItems(prod.items || []);
    setCategories(cats.items || []);
    if (!categoryId && cats.items?.[0]?.id) setCategoryId(cats.items[0].id);
  }

  useEffect(() => {
    load().catch((e) => setMsg(errMsg(e)));
  }, []);

  const filtered = useMemo(() => {
    return items.filter((p) => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      const needle = q.trim().toLowerCase();
      if (!needle) return true;
      const n = p.translations?.uz?.name || p.slug;
      return n.toLowerCase().includes(needle) || p.slug.toLowerCase().includes(needle);
    });
  }, [items, statusFilter, q]);

  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function create() {
    setMsg("");
    setOk("");
    if (!categoryId) {
      setMsg("Выберите категорию");
      return;
    }
    if (!slug.trim() || !name.trim()) {
      setMsg("Укажите slug и название");
      return;
    }
    await api("/v1/products", {
      method: "POST",
      body: JSON.stringify({
        category_id: categoryId,
        slug: slug.trim(),
        translations: { uz: { name }, ru: { name } },
        price,
        currency: "UZS",
        inventory_quantity: 5,
        status: "pending_review",
      }),
    });
    setSlug("");
    setName("");
    setOk("Товар создан (на модерации)");
    await load();
  }

  async function update(id: string, patch: Record<string, unknown>) {
    setMsg("");
    await api(`/v1/products/${id}`, { method: "PUT", body: JSON.stringify(patch) });
    setOk("Обновлено");
    await load();
  }

  return (
    <div>
      <PageHeader title={t("pageProductsTitle")} description={t("pageProductsDesc")} />

      <div className="mb-4 flex flex-wrap gap-2">
        <Input
          className="max-w-xs"
          placeholder="Search name / slug"
          value={q}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            setQ(e.target.value);
            setPage(1);
          }}
        />
        <Select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
        >
          {["all", "active", "draft", "pending_review", "archived"].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid gap-2 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm md:grid-cols-5">
        <Input placeholder="slug" value={slug} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSlug(e.target.value)} />
        <Input placeholder="name" value={name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)} />
        <Input type="number" value={price} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPrice(Number(e.target.value))} />
        <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          {categories.length === 0 ? <option value="">No categories</option> : null}
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.translations?.uz?.name || c.slug}
            </option>
          ))}
        </Select>
        <Button onClick={() => create().catch((e) => setMsg(errMsg(e)))}>Create</Button>
      </div>
      <Msg text={msg} />
      <Msg text={ok} tone="ok" />

      {pageItems.length === 0 ? (
        <div className="mt-6">
          <EmptyState text="Нет товаров" />
        </div>
      ) : (
        <div className="mt-6">
          <TableShell>
            <thead>
              <tr className="border-b bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Qty</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {pageItems.map((p) => (
                <tr key={p.id} className="border-b last:border-0 hover:bg-slate-50/60">
                  <td className="px-4 py-3">
                    <Link href={`/products/${p.id}`} className="font-medium text-teal hover:underline">
                      {p.translations?.uz?.name || p.slug}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <input
                      className="w-28 rounded-lg border border-slate-200 px-2 py-1"
                      type="number"
                      defaultValue={p.price}
                      onBlur={(e) => update(p.id, { price: Number(e.target.value) }).catch((err) => setMsg(errMsg(err)))}
                    />
                  </td>
                  <td className="px-4 py-3">{p.inventory_quantity ?? 0}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="space-x-2 whitespace-nowrap px-4 py-3">
                    <button
                      type="button"
                      className="font-medium text-teal"
                      onClick={() => update(p.id, { status: "pending_review" }).catch((e) => setMsg(errMsg(e)))}
                    >
                      submit
                    </button>
                    <button
                      type="button"
                      className="font-medium text-amber-700"
                      onClick={() => update(p.id, { status: "archived" }).catch((e) => setMsg(errMsg(e)))}
                    >
                      archive
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableShell>
        </div>
      )}
      <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} />
    </div>
  );
}
