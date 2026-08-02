"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button, Input } from "@gayrat/ui";
import { api, errMsg } from "@/lib/api";
import { EmptyState, Field, Msg, PageHeader, PanelCard, Select, StatusBadge } from "@/components/ui";
import { useI18n } from "@/lib/i18n";

type Product = {
  id: string;
  slug: string;
  price: number;
  status: string;
  inventory_quantity: number;
  category_id?: string;
  translations?: Record<string, { name?: string; description?: string }>;
  images?: string[] | unknown;
  seo?: { title?: string; description?: string } | string;
};

type Variant = {
  id: string;
  title?: string | null;
  sku?: string;
  price: number;
  inventory_quantity: number;
  status?: string;
};

type VariantDraft = {
  sku: string;
  title: string;
  price: number;
  stock: number;
};

function parseSeo(raw: Product["seo"]) {
  if (!raw) return { title: "", description: "" };
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as { title?: string; description?: string };
      return { title: parsed.title || "", description: parsed.description || "" };
    } catch {
      return { title: "", description: "" };
    }
  }
  return { title: raw.title || "", description: raw.description || "" };
}

export default function ProductDetailPage() {
  const params = useParams();
  const id = String(params.id || "");
  const { t } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState(0);
  const [stock, setStock] = useState(0);
  const [status, setStatus] = useState("draft");
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [variantDraft, setVariantDraft] = useState<VariantDraft>({ sku: "", title: "", price: 0, stock: 0 });
  const [editingVariant, setEditingVariant] = useState<Record<string, VariantDraft>>({});
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState("");

  async function load() {
    const data = await api<{ product: Product; variants?: Variant[] }>(`/v1/products/by-id/${id}`);
    setProduct(data.product);
    setVariants(data.variants || []);
    setName(data.product.translations?.uz?.name || data.product.slug);
    setDescription(data.product.translations?.uz?.description || data.product.translations?.ru?.description || "");
    setPrice(data.product.price);
    setStock(data.product.inventory_quantity);
    setStatus(data.product.status);
    const seo = parseSeo(data.product.seo);
    setSeoTitle(seo.title);
    setSeoDescription(seo.description);
    const drafts: Record<string, VariantDraft> = {};
    for (const v of data.variants || []) {
      drafts[v.id] = {
        sku: v.sku || "",
        title: v.title || "",
        price: v.price,
        stock: v.inventory_quantity,
      };
    }
    setEditingVariant(drafts);
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
          uz: { ...(product?.translations?.uz || {}), name, description },
          ru: { ...(product?.translations?.ru || {}), name, description },
        },
        seo: { title: seoTitle, description: seoDescription },
      }),
    });
    setOk(t("productSaved"));
    await load();
  }

  async function archive() {
    setMsg("");
    await api(`/v1/products/${id}`, { method: "PUT", body: JSON.stringify({ status: "archived" }) });
    setOk(t("productArchived"));
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
    setOk(t("productImageAdded"));
    await load();
  }

  async function removeImage(url: string) {
    setMsg("");
    const existing = Array.isArray(product?.images)
      ? product!.images.filter((x): x is string => typeof x === "string")
      : [];
    await api(`/v1/products/${id}/images`, {
      method: "POST",
      body: JSON.stringify({ urls: existing.filter((u) => u !== url) }),
    });
    setOk(t("productImageRemoved"));
    await load();
  }

  async function createVariant() {
    setMsg("");
    if (!variantDraft.sku.trim()) {
      setMsg(t("productVariantSkuRequired"));
      return;
    }
    await api(`/v1/products/${id}/variants`, {
      method: "POST",
      body: JSON.stringify({
        sku: variantDraft.sku.trim(),
        title: variantDraft.title.trim() || variantDraft.sku.trim(),
        price: variantDraft.price || price,
        inventory_quantity: variantDraft.stock,
      }),
    });
    setVariantDraft({ sku: "", title: "", price: 0, stock: 0 });
    setOk(t("productVariantCreated"));
    await load();
  }

  async function updateVariant(variantId: string) {
    setMsg("");
    const draft = editingVariant[variantId];
    if (!draft) return;
    await api(`/v1/products/${id}/variants/${variantId}`, {
      method: "PUT",
      body: JSON.stringify({
        sku: draft.sku.trim() || undefined,
        title: draft.title.trim() || undefined,
        price: draft.price,
        inventory_quantity: draft.stock,
      }),
    });
    setOk(t("productVariantUpdated"));
    await load();
  }

  if (!product && !msg) return <p className="text-sm text-slate-500">{t("commonLoading")}</p>;
  if (!product) {
    return (
      <div>
        <PageHeader title={t("productNotFound")} actions={<Link href="/products" className="text-sm text-teal hover:underline">← {t("commonBack")}</Link>} />
        <Msg text={msg || t("productNotFound")} />
      </div>
    );
  }

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
            ← {t("navProducts")}
          </Link>
        }
      />
      <Msg text={msg} />
      <Msg text={ok} tone="ok" />

      <div className="grid gap-6 lg:grid-cols-2">
        <PanelCard className="space-y-3 p-4">
          <Field label={t("productsColName")}>
            <Input value={name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)} />
          </Field>
          <Field label={t("settingsDescription")}>
            <textarea
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          <Field label={t("productsColPrice")}>
            <Input type="number" value={price} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPrice(Number(e.target.value))} />
          </Field>
          <Field label={t("productsColStock")}>
            <Input type="number" value={stock} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setStock(Number(e.target.value))} />
          </Field>
          <Field label={t("productsColStatus")}>
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              {["draft", "pending_review", "archived"].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
              {product.status === "active" ? <option value="active">active</option> : null}
            </Select>
          </Field>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={product.status} />
            <Button onClick={() => save().catch((e) => setMsg(errMsg(e)))}>{t("commonSave")}</Button>
            <Button variant="secondary" onClick={() => archive().catch((e) => setMsg(errMsg(e)))}>
              {t("productArchive")}
            </Button>
          </div>
          <p className="text-xs text-slate-500">{t("productStatusHint")}</p>
        </PanelCard>

        <div className="space-y-6">
          <PanelCard className="p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{t("productImages")}</h2>
              <Button variant="secondary" className="!px-3 !py-1.5 text-xs" onClick={() => fileRef.current?.click()}>
                {t("productUpload")}
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
                <div key={src} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="h-20 w-20 rounded-lg object-cover" />
                  <button
                    type="button"
                    className="absolute -end-1 -top-1 rounded-full bg-rose-600 px-1.5 text-[10px] font-bold text-white"
                    onClick={() => removeImage(src).catch((e) => setMsg(errMsg(e)))}
                  >
                    ×
                  </button>
                </div>
              ))}
              {images.length === 0 && <EmptyState text={t("productNoImages")} />}
            </div>
          </PanelCard>

          <PanelCard className="space-y-3 p-4">
            <h2 className="font-semibold">{t("productSeo")}</h2>
            <Field label={t("productSeoTitle")}>
              <Input value={seoTitle} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSeoTitle(e.target.value)} />
            </Field>
            <Field label={t("productSeoDescription")}>
              <textarea
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                rows={2}
                value={seoDescription}
                onChange={(e) => setSeoDescription(e.target.value)}
              />
            </Field>
          </PanelCard>

          <PanelCard className="p-4">
            <h2 className="font-semibold">{t("productVariants")}</h2>
            {variants.length === 0 ? (
              <div className="mt-2">
                <EmptyState text={t("productNoVariants")} />
              </div>
            ) : (
              <ul className="mt-2 space-y-3 text-sm">
                {variants.map((v) => {
                  const draft = editingVariant[v.id] || { sku: v.sku || "", title: v.title || "", price: v.price, stock: v.inventory_quantity };
                  return (
                    <li key={v.id} className="rounded-xl border bg-white px-3 py-3">
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Input
                          placeholder="SKU"
                          value={draft.sku}
                          onChange={(e) =>
                            setEditingVariant((prev) => ({ ...prev, [v.id]: { ...draft, sku: e.target.value } }))
                          }
                        />
                        <Input
                          placeholder={t("productsColName")}
                          value={draft.title}
                          onChange={(e) =>
                            setEditingVariant((prev) => ({ ...prev, [v.id]: { ...draft, title: e.target.value } }))
                          }
                        />
                        <Input
                          type="number"
                          placeholder={t("productsColPrice")}
                          value={draft.price}
                          onChange={(e) =>
                            setEditingVariant((prev) => ({ ...prev, [v.id]: { ...draft, price: Number(e.target.value) } }))
                          }
                        />
                        <Input
                          type="number"
                          placeholder={t("productsColStock")}
                          value={draft.stock}
                          onChange={(e) =>
                            setEditingVariant((prev) => ({ ...prev, [v.id]: { ...draft, stock: Number(e.target.value) } }))
                          }
                        />
                      </div>
                      <Button
                        variant="secondary"
                        className="mt-2 !px-3 !py-1.5 text-xs"
                        onClick={() => updateVariant(v.id).catch((e) => setMsg(errMsg(e)))}
                      >
                        {t("commonSave")}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t("productAddVariant")}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <Input
                  placeholder="SKU *"
                  value={variantDraft.sku}
                  onChange={(e) => setVariantDraft((d) => ({ ...d, sku: e.target.value }))}
                />
                <Input
                  placeholder={t("productsColName")}
                  value={variantDraft.title}
                  onChange={(e) => setVariantDraft((d) => ({ ...d, title: e.target.value }))}
                />
                <Input
                  type="number"
                  placeholder={t("productsColPrice")}
                  value={variantDraft.price || ""}
                  onChange={(e) => setVariantDraft((d) => ({ ...d, price: Number(e.target.value) }))}
                />
                <Input
                  type="number"
                  placeholder={t("productsColStock")}
                  value={variantDraft.stock || ""}
                  onChange={(e) => setVariantDraft((d) => ({ ...d, stock: Number(e.target.value) }))}
                />
              </div>
              <Button className="mt-2 !px-3 !py-1.5 text-xs" onClick={() => createVariant().catch((e) => setMsg(errMsg(e)))}>
                {t("productAddVariant")}
              </Button>
            </div>
          </PanelCard>
        </div>
      </div>
    </div>
  );
}
