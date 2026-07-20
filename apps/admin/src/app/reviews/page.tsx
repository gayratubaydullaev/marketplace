"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Badge, Card, Input } from "@gayrat/ui";
import { api, errMsg } from "@/lib/api";
import { EmptyState, Msg, PageHeader, Pagination } from "@/components/ui";
import { useI18n } from "@/lib/i18n";

type Review = {
  id: string;
  product_id?: string;
  vendor_id?: string;
  rating: number;
  title?: string;
  body?: string;
  status?: string;
};

const PAGE_SIZE = 15;

export default function ReviewsPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<Review[]>([]);
  const [status, setStatus] = useState("pending");
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState("");
  const [reason, setReason] = useState("");
  const [page, setPage] = useState(1);

  async function load(st = status) {
    const data = await api<{ items: Review[] }>(`/v1/admin/reviews?status=${st}`);
    setItems(data.items || []);
    setPage(1);
  }

  useEffect(() => {
    load().catch((e) => setMsg(errMsg(e)));
  }, []);

  async function moderate(id: string, next: string) {
    setMsg("");
    await api(`/v1/admin/reviews/${id}/moderate`, {
      method: "POST",
      body: JSON.stringify({ status: next, reason: reason || undefined }),
    });
    setOk(`Review → ${next}`);
    setReason("");
    await load();
  }

  const pageItems = useMemo(() => items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [items, page]);

  return (
    <div>
      <PageHeader title={t("pageReviewsTitle")} description={t("pageReviewsDesc")} />
      <div className="mt-4 flex flex-wrap gap-2">
        {["pending", "approved", "rejected", "all"].map((s) => (
          <Button
            key={s}
            variant={status === s ? "primary" : "secondary"}
            onClick={() => {
              setStatus(s);
              load(s).catch((e) => setMsg(errMsg(e)));
            }}
          >
            {s}
          </Button>
        ))}
      </div>
      <Input
        className="mt-3 max-w-md"
        placeholder="Reject reason (optional)"
        value={reason}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => setReason(e.target.value)}
      />
      <Msg text={msg} />
      <Msg text={ok} tone="ok" />
      <div className="mt-6 space-y-3">
        {pageItems.map((r) => (
          <Card key={r.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">
                  ★ {r.rating} — {r.title || "Review"}
                </p>
                <p className="text-sm text-slate-600">{r.body}</p>
                <p className="mt-1 font-mono text-xs text-slate-400">
                  product {r.product_id || "—"}
                  {r.vendor_id ? ` · vendor ${r.vendor_id}` : ""}
                </p>
              </div>
              <Badge tone={r.status === "approved" ? "success" : r.status === "rejected" ? "danger" : "warning"}>
                {r.status}
              </Badge>
            </div>
            <div className="mt-3 space-x-2">
              <Button variant="secondary" onClick={() => moderate(r.id, "approved").catch((e) => setMsg(errMsg(e)))}>
                Approve
              </Button>
              <Button variant="ghost" onClick={() => moderate(r.id, "rejected").catch((e) => setMsg(errMsg(e)))}>
                Reject
              </Button>
            </div>
          </Card>
        ))}
        {items.length === 0 && <EmptyState text="No reviews in this queue." />}
      </div>
      <Pagination page={page} pageSize={PAGE_SIZE} total={items.length} onPage={setPage} />
    </div>
  );
}
