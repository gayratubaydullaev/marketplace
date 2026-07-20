"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Input } from "@gayrat/ui";
import { api, errMsg } from "@/lib/api";
import { EmptyState, Msg, PageHeader, Pagination } from "@/components/ui";
import { useI18n } from "@/lib/i18n";

type Review = {
  id: string;
  rating: number;
  title?: string;
  body?: string;
  vendor_reply?: string;
  created_at?: string;
};

const PAGE_SIZE = 10;

export default function VendorReviews() {
  const { t } = useI18n();
  const [items, setItems] = useState<Review[]>([]);
  const [replies, setReplies] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState("");
  const [page, setPage] = useState(1);
  const [slug, setSlug] = useState("");

  async function load() {
    const settings = await api<{ slug?: string }>("/v1/vendor/settings");
    if (!settings.slug) {
      setMsg("Профиль продавца не найден");
      return;
    }
    setSlug(settings.slug);
    const data = await api<{ items: Review[] }>(`/v1/vendors/${settings.slug}/reviews`);
    setItems(data.items || []);
  }

  useEffect(() => {
    load().catch((e) => setMsg(errMsg(e)));
  }, []);

  const pageItems = useMemo(() => items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [items, page]);

  async function reply(id: string) {
    const text = replies[id];
    if (!text?.trim()) {
      setMsg("Введите ответ");
      return;
    }
    setMsg("");
    await api(`/v1/reviews/${id}/reply`, { method: "POST", body: JSON.stringify({ reply: text }) });
    setReplies((r) => ({ ...r, [id]: "" }));
    setOk("Ответ отправлен");
    await load();
  }

  return (
    <div>
      <PageHeader
        title={t("pageReviewsTitle")}
        description={slug ? `${t("pageReviewsDesc")} · /${slug}` : t("pageReviewsDesc")}
      />
      <Msg text={msg} />
      <Msg text={ok} tone="ok" />
      {pageItems.length === 0 ? (
        <EmptyState text="Пока нет отзывов" />
      ) : (
        <div className="mt-4 space-y-3">
          {pageItems.map((r) => (
            <div key={r.id} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
              <p className="font-semibold">
                {"★".repeat(Math.min(5, r.rating || 0))} {r.title || ""}
              </p>
              <p className="mt-1 text-sm text-slate-600">{r.body}</p>
              {r.vendor_reply ? <p className="mt-2 text-sm text-teal">Ответ: {r.vendor_reply}</p> : null}
              {!r.vendor_reply && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Input
                    placeholder="Ваш ответ"
                    value={replies[r.id] || ""}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setReplies((prev) => ({ ...prev, [r.id]: e.target.value }))
                    }
                  />
                  <Button onClick={() => reply(r.id).catch((e) => setMsg(errMsg(e)))}>Reply</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <Pagination page={page} pageSize={PAGE_SIZE} total={items.length} onPage={setPage} />
    </div>
  );
}
