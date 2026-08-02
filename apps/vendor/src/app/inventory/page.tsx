"use client";

import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import { api, errMsg } from "@/lib/api";
import { ConfirmDialog, EmptyState, Msg, PageHeader, StatusBadge, TableShell } from "@/components/ui";
import { useI18n } from "@/lib/i18n";

type Variant = {
  id: string;
  title?: string | null;
  sku?: string;
  inventory_quantity?: number;
};

type Product = {
  id: string;
  slug: string;
  inventory_quantity?: number;
  status?: string;
  translations?: Record<string, { name?: string }>;
  variants: Variant[];
};

type PendingUpdate = {
  kind: "product" | "variant";
  productId: string;
  variantId?: string;
  qty: number;
  label: string;
};

const LOW = 5;

export default function InventoryPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<Product[]>([]);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<PendingUpdate | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await api<{ items: Omit<Product, "variants">[] }>("/v1/vendor/products");
      const products = data.items || [];
      const rows = await Promise.all(
        products.map(async (p) => {
          try {
            const v = await api<{ items?: Variant[] }>(`/v1/products/id/${p.id}/variants`);
            return { ...p, variants: v.items || [] };
          } catch {
            return { ...p, variants: [] as Variant[] };
          }
        })
      );
      setItems(rows);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch((e) => setMsg(errMsg(e)));
  }, []);

  function requestUpdate(update: PendingUpdate) {
    setMsg("");
    setOk("");
    setPending(update);
  }

  async function updateVariantInventory(productId: string, variantId: string, qty: number) {
    const attempts = [
      () => api(`/v1/products/variants/${variantId}`, { method: "PUT", body: JSON.stringify({ inventory_quantity: qty }) }),
      () =>
        api(`/v1/products/${productId}/variants/${variantId}`, {
          method: "PUT",
          body: JSON.stringify({ inventory_quantity: qty }),
        }),
    ];
    for (const attempt of attempts) {
      try {
        await attempt();
        return;
      } catch {
        /* try next endpoint */
      }
    }
    await api(`/v1/products/${productId}`, { method: "PUT", body: JSON.stringify({ inventory_quantity: qty }) });
  }

  async function confirmUpdate() {
    if (!pending) return;
    setBusy(true);
    setMsg("");
    try {
      if (pending.kind === "variant" && pending.variantId) {
        await updateVariantInventory(pending.productId, pending.variantId, pending.qty);
      } else {
        await api(`/v1/products/${pending.productId}`, {
          method: "PUT",
          body: JSON.stringify({ inventory_quantity: pending.qty }),
        });
      }
      setOk(t("inventoryUpdated", { qty: pending.qty }));
      setPending(null);
      await load();
    } catch (e) {
      setMsg(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  function variantLabel(v: Variant) {
    return v.title || v.sku || v.id.slice(0, 8);
  }

  function productName(p: Product) {
    return p.translations?.uz?.name || p.slug;
  }

  function qtyRow(key: string, qty: number, onBlur: (next: number) => void) {
    return (
      <input
        type="number"
        min={0}
        className="w-24 rounded-lg border border-slate-200 px-2 py-1"
        defaultValue={qty}
        key={`${key}-${qty}`}
        onBlur={(e) => {
          const next = Number(e.target.value);
          if (Number.isNaN(next) || next === qty) return;
          onBlur(next);
        }}
      />
    );
  }

  return (
    <div>
      <PageHeader title={t("pageInventoryTitle")} description={t("pageInventoryDesc")} />
      <Msg text={msg} />
      <Msg text={ok} tone="ok" />
      {loading && items.length === 0 ? (
        <p className="text-sm text-slate-500">{t("commonLoading")}</p>
      ) : items.length === 0 ? (
        <EmptyState text={t("inventoryEmpty")} />
      ) : (
        <TableShell>
          <thead>
            <tr className="border-b bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">{t("inventoryColProduct")}</th>
              <th className="px-4 py-3">{t("commonStatus")}</th>
              <th className="px-4 py-3">{t("inventoryColQty")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => {
              const hasVariants = p.variants.length > 0;
              const productQty = p.inventory_quantity ?? 0;
              const variantTotal = p.variants.reduce((sum, v) => sum + (v.inventory_quantity ?? 0), 0);
              const displayQty = hasVariants ? variantTotal : productQty;
              const low = displayQty <= LOW;

              return (
                <Fragment key={p.id}>
                  <tr className={`border-b ${low ? "bg-amber-50/50" : "hover:bg-slate-50/60"}`}>
                    <td className="px-4 py-3">
                      <Link href={`/products/${p.id}`} className="font-medium text-teal hover:underline">
                        {productName(p)}
                      </Link>
                      {hasVariants ? (
                        <span className="ml-2 text-xs text-slate-500">
                          ({p.variants.length} {t("inventoryVariants")})
                        </span>
                      ) : null}
                      {low ? (
                        <span className="ml-2 text-xs font-semibold text-amber-700">{t("inventoryLow")}</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={p.status} />
                    </td>
                    <td className="px-4 py-3">
                      {hasVariants ? (
                        <span className="text-sm tabular-nums text-slate-600">{displayQty}</span>
                      ) : (
                        qtyRow(p.id, productQty, (next) =>
                          requestUpdate({
                            kind: "product",
                            productId: p.id,
                            qty: next,
                            label: productName(p),
                          })
                        )
                      )}
                    </td>
                  </tr>
                  {p.variants.map((v) => {
                    const vQty = v.inventory_quantity ?? 0;
                    const vLow = vQty <= LOW;
                    return (
                      <tr
                        key={v.id}
                        className={`border-b last:border-0 ${vLow ? "bg-amber-50/30" : "hover:bg-slate-50/40"}`}
                      >
                        <td className="px-4 py-2 pl-10 text-sm text-slate-600">
                          <span className="text-slate-400">↳</span> {variantLabel(v)}
                          {vLow ? (
                            <span className="ml-2 text-xs font-semibold text-amber-700">{t("inventoryLow")}</span>
                          ) : null}
                        </td>
                        <td className="px-4 py-2" />
                        <td className="px-4 py-2">
                          {qtyRow(`${p.id}-${v.id}`, vQty, (next) =>
                            requestUpdate({
                              kind: "variant",
                              productId: p.id,
                              variantId: v.id,
                              qty: next,
                              label: `${productName(p)} · ${variantLabel(v)}`,
                            })
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>
        </TableShell>
      )}

      <ConfirmDialog
        open={!!pending}
        title={t("inventoryConfirmTitle")}
        description={
          pending
            ? t("inventoryConfirmDesc", { label: pending.label, qty: pending.qty })
            : undefined
        }
        confirmLabel={t("commonSave")}
        cancelLabel={t("commonCancel")}
        busy={busy}
        onConfirm={() => confirmUpdate().catch((e) => setMsg(errMsg(e)))}
        onCancel={() => {
          if (busy) return;
          setPending(null);
          load().catch(() => undefined);
        }}
      />
    </div>
  );
}
