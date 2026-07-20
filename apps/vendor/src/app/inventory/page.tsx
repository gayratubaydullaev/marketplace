"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, errMsg } from "@/lib/api";
import { EmptyState, Msg, PageHeader, StatusBadge, TableShell } from "@/components/ui";
import { useI18n } from "@/lib/i18n";

type Product = {
  id: string;
  slug: string;
  inventory_quantity?: number;
  status?: string;
  translations?: Record<string, { name?: string }>;
};

const LOW = 5;

export default function InventoryPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<Product[]>([]);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState("");

  async function load() {
    const data = await api<{ items: Product[] }>("/v1/vendor/products");
    setItems(data.items || []);
  }

  useEffect(() => {
    load().catch((e) => setMsg(errMsg(e)));
  }, []);

  async function updateQty(id: string, qty: number) {
    if (!confirm(`Установить остаток ${qty}?`)) {
      await load();
      return;
    }
    setMsg("");
    await api(`/v1/products/${id}`, { method: "PUT", body: JSON.stringify({ inventory_quantity: qty }) });
    setOk(`Остаток обновлён → ${qty}`);
    await load();
  }

  return (
    <div>
      <PageHeader title={t("pageInventoryTitle")} description={t("pageInventoryDesc")} />
      <Msg text={msg} />
      <Msg text={ok} tone="ok" />
      {items.length === 0 ? (
        <EmptyState text="Нет товаров" />
      ) : (
        <TableShell>
          <thead>
            <tr className="border-b bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Qty</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => {
              const qty = p.inventory_quantity ?? 0;
              const low = qty <= LOW;
              return (
                <tr key={p.id} className={`border-b last:border-0 ${low ? "bg-amber-50/50" : "hover:bg-slate-50/60"}`}>
                  <td className="px-4 py-3">
                    <Link href={`/products/${p.id}`} className="font-medium text-teal hover:underline">
                      {p.translations?.uz?.name || p.slug}
                    </Link>
                    {low ? <span className="ml-2 text-xs font-semibold text-amber-700">low</span> : null}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="number"
                      className="w-24 rounded-lg border border-slate-200 px-2 py-1"
                      defaultValue={qty}
                      key={`${p.id}-${qty}`}
                      onBlur={(e) => updateQty(p.id, Number(e.target.value)).catch((err) => setMsg(errMsg(err)))}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableShell>
      )}
    </div>
  );
}
