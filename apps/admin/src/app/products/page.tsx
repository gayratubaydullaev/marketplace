"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Input } from "@gayrat/ui";
import { api, apiBlob, errMsg } from "@/lib/api";
import { EmptyState, Msg, PageHeader, Pagination, Select, StatusBadge, TableShell } from "@/components/ui";
import { useI18n } from "@/lib/i18n";

type Product = {
  id: string;
  slug: string;
  price: number;
  status: string;
  inventory_quantity: number;
  category_id?: string;
  translations?: Record<string, { name?: string }>;
};

type Category = { id: string; slug: string; translations?: Record<string, { name?: string }> };

const PAGE_SIZE = 20;

export default function ProductsPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState(100000);
  const [categoryId, setCategoryId] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    const [prod, cats] = await Promise.all([
      api<{ items: Product[] }>(`/v1/products?status=${statusFilter}&limit=100&page=1`),
      api<{ items: Category[] }>("/v1/categories"),
    ]);
    setItems(prod.items || []);
    setCategories(cats.items || []);
    if (!categoryId && cats.items?.[0]?.id) setCategoryId(cats.items[0].id);
  }

  useEffect(() => {
    load().catch((e) => setMsg(errMsg(e)));
  }, [statusFilter]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((p) => {
      const n = p.translations?.uz?.name || p.slug;
      return n.toLowerCase().includes(needle) || p.slug.toLowerCase().includes(needle);
    });
  }, [items, q]);

  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function create() {
    setMsg("");
    setOk("");
    if (!categoryId) {
      setMsg("Select a category");
      return;
    }
    await api("/v1/products", {
      method: "POST",
      body: JSON.stringify({
        category_id: categoryId,
        slug,
        translations: { uz: { name }, ru: { name } },
        price,
        currency: "UZS",
        inventory_quantity: 10,
        status: "active",
      }),
    });
    setSlug("");
    setName("");
    setOk("Product created");
    await load();
  }

  async function setStatus(id: string, status: string) {
    setMsg("");
    await api(`/v1/products/${id}`, { method: "PUT", body: JSON.stringify({ status }) });
    setOk(`Status → ${status}`);
    await load();
  }

  async function moderate(id: string, status: string) {
    await api(`/v1/admin/products/${id}/moderate`, { method: "POST", body: JSON.stringify({ status }) });
    setOk(`Moderated → ${status}`);
    await load();
  }

  async function exportCsv() {
    const blob = await apiBlob("/v1/products/export/csv");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "products.csv";
    a.click();
    URL.revokeObjectURL(url);
    setOk("CSV exported");
  }

  async function importCsv(file: File) {
    const form = new FormData();
    form.append("file", file);
    await api("/v1/products/import/csv", { method: "POST", body: form });
    await load();
    setOk("CSV imported");
  }

  async function bulkSample() {
    await api("/v1/products/bulk", {
      method: "POST",
      body: JSON.stringify({
        products: [
          {
            category_id: categoryId,
            slug: `bulk-${Date.now()}`,
            translations: { uz: { name: "Bulk item" }, ru: { name: "Bulk item" } },
            price: 99000,
          },
        ],
      }),
    });
    await load();
    setOk("Bulk sample created");
  }

  return (
    <div>
      <PageHeader title={t("pageProductsTitle")} description={t("pageProductsDesc")}
        actions={
          <>
            <Button variant="secondary" onClick={() => exportCsv().catch((e) => setMsg(errMsg(e)))}>
              Export CSV
            </Button>
            <Button variant="secondary" onClick={() => fileRef.current?.click()}>
              Import CSV
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importCsv(f).catch((err) => setMsg(errMsg(err)));
              }}
            />
            <Button variant="secondary" onClick={() => bulkSample().catch((e) => setMsg(errMsg(e)))}>
              Bulk sample
            </Button>
          </>
        }
      />

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
          {["all", "active", "draft", "archived", "pending_review"].map((s) => (
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
          <EmptyState text="No products" />
        </div>
      ) : (
        <div className="mt-6">
          <TableShell>
            <thead>
              <tr className="border-b bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Stock</th>
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
                  <td className="px-4 py-3">{p.price?.toLocaleString()} UZS</td>
                  <td className="px-4 py-3">{p.inventory_quantity}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="space-x-2 whitespace-nowrap px-4 py-3">
                    <button type="button" className="font-medium text-teal" onClick={() => setStatus(p.id, "active").catch((e) => setMsg(errMsg(e)))}>
                      active
                    </button>
                    <button type="button" className="font-medium text-amber-600" onClick={() => setStatus(p.id, "archived").catch((e) => setMsg(errMsg(e)))}>
                      archive
                    </button>
                    {p.status === "pending_review" && (
                      <button type="button" className="font-medium text-emerald-700" onClick={() => moderate(p.id, "active").catch((e) => setMsg(errMsg(e)))}>
                        approve
                      </button>
                    )}
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
