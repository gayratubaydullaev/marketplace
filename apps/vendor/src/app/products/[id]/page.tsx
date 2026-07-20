"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button, Input } from "@gayrat/ui";
import { api, errMsg } from "@/lib/api";
import { Msg, PageHeader, Select, StatusBadge } from "@/components/ui";

type Product = {
  id: string;
  slug: string;
  price: number;
  status: string;
  inventory_quantity: number;
  category_id?: string;
  translations?: Record<string, { name?: string; description?: string }>;
  images?: string[] | unknown;
};

type Variant = { id: string; title?: string | null; sku?: string; price: number; inventory_quantity: number };

export default function ProductDetailPage() {
  const params = useParams();
  const id = String(params.id || "");
  const fileRef = useRef<HTMLInputElement>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [name, setName] = useState("");
  const [price, setPrice] = useState(0);
  const [stock, setStock] = useState(0);
  const [status, setStatus] = useState("draft");
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState("");

  async function load() {
    const data = await api<{ product: Product; variants?: Variant[] }>(`/v1/products/by-id/${id}`);
    setProduct(data.product);
    setVariants(data.variants || []);
    setName(data.product.translations?.uz?.name || data.product.slug);
    setPrice(data.product.price);
    setStock(data.product.inventory_quantity);
    setStatus(data.product.status);
  }

  useEffect(() => {
    if (!id) return;
    load().catch((e) => setMsg(errMsg(e)));
  }, [id]);

  async function save() {
    setMsg("");
    setOk("");
    await api(`/v1/products/${id}`, {
      method: "PUT",
      body: JSON.stringify({
        price,
        inventory_quantity: stock,
        status,
        translations: {
          ...(product?.translations || {}),
          uz: { ...(product?.translations?.uz || {}), name },
          ru: { ...(product?.translations?.ru || {}), name },
        },
      }),
    });
    setOk("Сохранено");
    await load();
  }

  async function archive() {
    setMsg("");
    await api(`/v1/products/${id}`, { method: "PUT", body: JSON.stringify({ status: "archived" }) });
    setOk("Архивировано");
    await load();
  }

  async function uploadImage(file: File) {
    setMsg("");
    const form = new FormData();
    form.append("file", file);
    const uploaded = await api<{ url: string }>("/v1/media/upload", { method: "POST", body: form });
    const existing = Array.isArray(product?.images)
      ? product!.images.filter((x): x is string => typeof x === "string")
      : [];
    await api(`/v1/products/${id}/images`, {
      method: "POST",
      body: JSON.stringify({ urls: [...existing, uploaded.url] }),
    });
    setOk("Фото добавлено");
    await load();
  }

  if (!product && !msg) return <p className="text-sm text-slate-500">Загрузка…</p>;
  if (!product) return <Msg text={msg} />;

  const images = Array.isArray(product.images)
    ? product.images.filter((x): x is string => typeof x === "string")
    : [];

  return (
    <div>
      <PageHeader
        title={name}
        description={product.slug}
        actions={
          <Link href="/products" className="text-sm text-teal hover:underline">
            ← Products
          </Link>
        }
      />
      <Msg text={msg} />
      <Msg text={ok} tone="ok" />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <Input value={name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)} />
          <Input type="number" value={price} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPrice(Number(e.target.value))} />
          <Input type="number" value={stock} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setStock(Number(e.target.value))} />
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            {["draft", "pending_review", "archived"].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
            {product.status === "active" ? <option value="active">active</option> : null}
          </Select>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={product.status} />
            <Button onClick={() => save().catch((e) => setMsg(errMsg(e)))}>Save</Button>
            <Button variant="secondary" onClick={() => archive().catch((e) => setMsg(errMsg(e)))}>
              Archive
            </Button>
          </div>
          <p className="text-xs text-slate-500">Статус active выставляет модератор. Отправьте на pending_review.</p>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Images</h2>
            <Button variant="secondary" className="!px-3 !py-1.5 text-xs" onClick={() => fileRef.current?.click()}>
              Upload
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadImage(f).catch((err) => setMsg(errMsg(err)));
              }}
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {images.map((src) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={src} src={src} alt="" className="h-20 w-20 rounded-lg object-cover" />
            ))}
            {images.length === 0 && <p className="text-sm text-slate-500">Нет фото</p>}
          </div>
          <h2 className="mt-6 font-semibold">Variants</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {variants.map((v) => (
              <li key={v.id} className="rounded-xl border bg-white px-3 py-2">
                {v.title || v.sku || v.id.slice(0, 8)} · {v.price.toLocaleString()} UZS · stock {v.inventory_quantity}
              </li>
            ))}
            {variants.length === 0 && <p className="text-slate-500">Нет вариантов</p>}
          </ul>
        </div>
      </div>
    </div>
  );
}
