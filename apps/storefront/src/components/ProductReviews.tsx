"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/lib/api";

type Review = {
  rating: number;
  title?: string;
  body?: string;
  id?: string;
  created_at?: string;
  author_name?: string;
  user_name?: string;
  vendor_reply?: string;
  helpful_count?: number;
  verified_purchase?: boolean;
  media?: string[] | string;
  score_delivery?: number;
  score_quality?: number;
  score_communication?: number;
};

type Eligibility = {
  can_review: boolean;
  already_reviewed?: boolean;
  order_id?: string;
  vendor_id?: string;
  reason?: string;
};

function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value}/5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <svg
          key={n}
          width={size}
          height={size}
          viewBox="0 0 24 24"
          className={n <= value ? "text-saffron" : "text-night/15"}
          aria-hidden
        >
          <path
            fill="currentColor"
            d="M12 2.5l2.9 6.1 6.6.7-4.9 4.5 1.4 6.5L12 16.9 5.9 20.3l1.4-6.5L2.5 9.3l6.6-.7L12 2.5z"
          />
        </svg>
      ))}
    </span>
  );
}

function StarPicker({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (n: number) => void;
  label: string;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold text-muted">{label}</p>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className="rounded-lg p-0.5 transition hover:bg-night/4"
            aria-label={`${n}`}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              className={n <= value ? "text-saffron" : "text-night/20"}
              aria-hidden
            >
              <path
                fill="currentColor"
                d="M12 2.5l2.9 6.1 6.6.7-4.9 4.5 1.4 6.5L12 16.9 5.9 20.3l1.4-6.5L2.5 9.3l6.6-.7L12 2.5z"
              />
            </svg>
          </button>
        ))}
      </div>
    </div>
  );
}

function reviewMedia(r: Review): string[] {
  if (Array.isArray(r.media)) return r.media.filter((u) => typeof u === "string");
  if (typeof r.media === "string") {
    try {
      const parsed = JSON.parse(r.media);
      return Array.isArray(parsed) ? parsed.filter((u): u is string => typeof u === "string") : [];
    } catch {
      return [];
    }
  }
  return [];
}

function formatDate(iso: string | undefined, locale: string) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  try {
    return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(d);
  } catch {
    return d.toLocaleDateString();
  }
}

export function ProductReviews({
  productId,
  productSlug,
  vendorId,
  initialRating,
  initialCount,
}: {
  productId: string;
  productSlug?: string;
  vendorId?: string | null;
  locale?: string;
  initialRating?: number | null;
  initialCount?: number | null;
}) {
  const t = useTranslations("product");
  const locale = useLocale();
  const [items, setItems] = useState<Review[]>([]);
  const [total, setTotal] = useState(0);
  const [histogram, setHistogram] = useState<Record<string, number>>({});
  const [serverAvg, setServerAvg] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [msg, setMsg] = useState("");
  const [msgOk, setMsgOk] = useState(false);
  const [sending, setSending] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [eligibility, setEligibility] = useState<Eligibility | null>(null);
  const [sort, setSort] = useState("newest");
  const [helpfulBusy, setHelpfulBusy] = useState<Record<string, boolean>>({});
  const [voted, setVoted] = useState<Record<string, boolean>>({});
  const [mediaUrls, setMediaUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [scoreDelivery, setScoreDelivery] = useState(5);
  const [scoreQuality, setScoreQuality] = useState(5);
  const [scoreComms, setScoreComms] = useState(5);

  async function load(nextSort = sort) {
    setLoading(true);
    try {
      const d = await api<{
        items: Review[];
        total?: number;
        average?: number;
        histogram?: Record<string, number>;
      }>(`/v1/products/${productId}/reviews?limit=50&sort=${nextSort}`);
      setItems(d.items || []);
      setTotal(typeof d.total === "number" ? d.total : (d.items || []).length);
      setServerAvg(typeof d.average === "number" ? d.average : null);
      setHistogram(d.histogram || {});
    } catch {
      setItems([]);
      setTotal(0);
      setServerAvg(null);
      setHistogram({});
    } finally {
      setLoading(false);
    }
  }

  async function loadEligibility(isLoggedIn: boolean) {
    if (!isLoggedIn) {
      setEligibility(null);
      return;
    }
    try {
      const d = await api<Eligibility>(`/v1/products/${productId}/review-eligibility`);
      setEligibility(d);
    } catch {
      setEligibility(null);
    }
  }

  useEffect(() => {
    const isLoggedIn = Boolean(localStorage.getItem("access_token"));
    setLoggedIn(isLoggedIn);
    load();
    loadEligibility(isLoggedIn);
  }, [productId]);

  const avg =
    serverAvg ??
    (typeof initialRating === "number" && initialRating > 0 ? initialRating : null);
  const reviewCount =
    total > 0
      ? total
      : typeof initialCount === "number" && initialCount > 0
        ? initialCount
        : 0;
  const loginHref = productSlug
    ? `/${locale}/account?next=${encodeURIComponent(`/${locale}/products/${productSlug}#reviews`)}`
    : `/${locale}/account`;

  const canWrite = loggedIn && eligibility?.can_review === true;
  const alreadyReviewed = eligibility?.already_reviewed === true;
  const needPurchase = loggedIn && eligibility && !eligibility.can_review && !eligibility.already_reviewed;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSending(true);
    setMsg("");
    setMsgOk(false);
    try {
      const payload: Record<string, unknown> = {
        rating,
        title,
        body,
        media: mediaUrls,
        score_delivery: scoreDelivery,
        score_quality: scoreQuality,
        score_communication: scoreComms,
      };
      if (eligibility?.order_id) payload.order_id = eligibility.order_id;
      const vid = eligibility?.vendor_id || vendorId;
      if (vid) payload.vendor_id = vid;
      const res = await api<{ status?: string }>(`/v1/products/${productId}/reviews`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setTitle("");
      setBody("");
      setRating(5);
      setMediaUrls([]);
      setScoreDelivery(5);
      setScoreQuality(5);
      setScoreComms(5);
      setMsgOk(true);
      setMsg(res.status === "pending" ? t("reviewPending") : t("reviewSent"));
      await Promise.all([load(), loadEligibility(true)]);
    } catch (err) {
      setMsgOk(false);
      setMsg(err instanceof Error ? err.message : t("reviewError"));
    } finally {
      setSending(false);
    }
  }

  async function markHelpful(id: string) {
    if (!loggedIn || !id || voted[id] || helpfulBusy[id]) return;
    setHelpfulBusy((s) => ({ ...s, [id]: true }));
    try {
      const res = await api<{ helpful_count?: number; already_voted?: boolean }>(
        `/v1/reviews/${id}/helpful`,
        { method: "POST", body: "{}" }
      );
      setVoted((v) => ({ ...v, [id]: true }));
      if (typeof res.helpful_count === "number") {
        setItems((list) =>
          list.map((r) => (r.id === id ? { ...r, helpful_count: res.helpful_count } : r))
        );
      } else {
        setItems((list) =>
          list.map((r) =>
            r.id === id ? { ...r, helpful_count: (r.helpful_count || 0) + (res.already_voted ? 0 : 1) } : r
          )
        );
      }
    } catch {
      /* ignore */
    } finally {
      setHelpfulBusy((s) => ({ ...s, [id]: false }));
    }
  }

  async function onPickMedia(files: FileList | null) {
    if (!files?.length) return;
    const remaining = 6 - mediaUrls.length;
    if (remaining <= 0) {
      setMsg(t("mediaLimit"));
      setMsgOk(false);
      return;
    }
    setUploading(true);
    setMsg("");
    try {
      const picked = Array.from(files).slice(0, remaining);
      const uploaded: string[] = [];
      for (const file of picked) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await api<{ url?: string; variants?: { webp?: string; original?: string } }>(
          "/v1/media/upload",
          { method: "POST", body: fd }
        );
        const url = res.variants?.webp || res.variants?.original || res.url;
        if (url) uploaded.push(url);
      }
      setMediaUrls((prev) => [...prev, ...uploaded]);
    } catch (err) {
      setMsgOk(false);
      setMsg(err instanceof Error ? err.message : t("mediaError"));
    } finally {
      setUploading(false);
    }
  }

  function changeSort(next: string) {
    setSort(next);
    load(next);
  }

  return (
    <section id="reviews" className="scroll-mt-28 mt-12 border-t border-night/8 pt-10 sm:mt-16 sm:pt-12 lg:mt-20 lg:pt-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold text-night sm:text-2xl">{t("reviews")}</h2>
          {avg != null && reviewCount > 0 ? (
            <p className="mt-1.5 text-sm text-muted">
              {t("reviewsSummary", { avg: avg.toFixed(1), count: reviewCount })}
            </p>
          ) : null}
        </div>
        {avg != null ? (
          <div className="flex items-center gap-2 rounded-2xl border border-night/8 bg-white/60 px-3.5 py-2 text-sm">
            <Stars value={Math.round(avg)} size={16} />
            <span className="font-bold text-night">{avg.toFixed(1)}</span>
          </div>
        ) : null}
      </div>

      {!loading && reviewCount > 0 ? (
        <div className="mt-5 max-w-sm space-y-1.5">
          {[5, 4, 3, 2, 1].map((star) => {
            const count = histogram[String(star)] ?? items.filter((r) => Math.round(r.rating) === star).length;
            const pct = reviewCount ? Math.round((count / reviewCount) * 100) : 0;
            return (
              <div key={star} className="grid grid-cols-[1.25rem_1fr_2rem] items-center gap-2 text-xs">
                <span className="font-semibold tabular-nums text-muted">{star}</span>
                <div className="h-2 overflow-hidden rounded-full bg-night/[0.06]">
                  <div
                    className="h-full rounded-full bg-saffron/85 transition-[width] duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-end tabular-nums text-muted">{count}</span>
              </div>
            );
          })}
        </div>
      ) : null}

      {items.length > 1 ? (
        <div className="mt-5 flex flex-wrap gap-2">
          {[
            ["newest", t("sortNewest")],
            ["helpful", t("sortHelpful")],
            ["rating_high", t("sortRatingHigh")],
            ["rating_low", t("sortRatingLow")],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => changeSort(value)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                sort === value ? "bg-night text-white" : "bg-night/5 text-muted hover:bg-night/10"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-6 lg:mt-8 lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)] lg:items-start lg:gap-12 xl:gap-16">
        <div>
          {loading ? (
            <div className="space-y-3 animate-pulse">
              {[1, 2].map((i) => (
                <div key={i} className="h-20 rounded-xl bg-night/5" />
              ))}
            </div>
          ) : (
            <ul className="space-y-4 lg:space-y-5">
              {items.map((r, i) => {
                const author = r.author_name || r.user_name;
                const date = formatDate(r.created_at, locale);
                const helpful = r.helpful_count || 0;
                return (
                  <li
                    key={r.id || i}
                    className="rounded-2xl border border-night/6 bg-white/50 px-4 py-4 transition hover:border-night/12 lg:px-5 lg:py-5"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Stars value={r.rating} />
                      {r.title ? <p className="text-sm font-semibold text-night">{r.title}</p> : null}
                      {r.verified_purchase ? (
                        <span className="rounded-full bg-teal/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-teal">
                          {t("verifiedPurchase")}
                        </span>
                      ) : null}
                    </div>
                    {(author || date) && (
                      <p className="mt-1 text-xs text-muted">
                        {[author, date].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    {r.body ? <p className="mt-2 text-sm leading-relaxed text-night/75">{r.body}</p> : null}
                    {(r.score_delivery || r.score_quality || r.score_communication) ? (
                      <p className="mt-2 text-[11px] text-muted">
                        {[
                          r.score_delivery ? `${t("scoreDelivery")}: ${r.score_delivery}` : null,
                          r.score_quality ? `${t("scoreQuality")}: ${r.score_quality}` : null,
                          r.score_communication ? `${t("scoreComms")}: ${r.score_communication}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    ) : null}
                    {reviewMedia(r).length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {reviewMedia(r).map((url) => (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            key={url}
                            src={url}
                            alt=""
                            className="h-16 w-16 rounded-lg object-cover ring-1 ring-night/10"
                          />
                        ))}
                      </div>
                    ) : null}
                    {r.vendor_reply ? (
                      <div className="mt-3 rounded-xl border border-teal/15 bg-teal/[0.04] px-3.5 py-2.5">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-teal">{t("vendorReply")}</p>
                        <p className="mt-1 text-sm text-night/80">{r.vendor_reply}</p>
                      </div>
                    ) : null}
                    {r.id && loggedIn ? (
                      <button
                        type="button"
                        disabled={Boolean(voted[r.id]) || Boolean(helpfulBusy[r.id])}
                        onClick={() => markHelpful(r.id!)}
                        className="mt-3 text-xs font-semibold text-muted transition hover:text-teal disabled:opacity-60"
                      >
                        {voted[r.id] ? t("helpfulThanks") : t("helpful", { count: helpful })}
                      </button>
                    ) : helpful > 0 ? (
                      <p className="mt-3 text-xs text-muted">{t("helpful", { count: helpful })}</p>
                    ) : null}
                  </li>
                );
              })}
              {items.length === 0 && (
                <div className="rounded-2xl border border-dashed border-night/12 bg-white/40 px-5 py-10 text-center lg:py-14">
                  <p className="text-sm font-semibold text-night/70">{t("noReviews")}</p>
                  <p className="mx-auto mt-1.5 max-w-xs text-xs text-muted">{t("noReviewsHint")}</p>
                </div>
              )}
            </ul>
          )}
        </div>

        <aside className="mt-8 lg:mt-0 lg:sticky lg:top-28">
          {!loggedIn ? (
            <p className="rounded-2xl border border-night/8 bg-white/60 px-5 py-4 text-sm text-muted">
              {t("loginToReview")}{" "}
              <Link href={loginHref} className="font-semibold text-teal hover:underline">
                {t("loginLink")}
              </Link>
            </p>
          ) : alreadyReviewed ? (
            <p className="rounded-2xl border border-night/8 bg-white/60 px-5 py-4 text-sm text-muted">
              {t("alreadyReviewed")}
            </p>
          ) : needPurchase ? (
            <p className="rounded-2xl border border-night/8 bg-white/60 px-5 py-4 text-sm text-muted">
              {t("purchaseToReview")}{" "}
              <Link href={`/${locale}/account?tab=orders`} className="font-semibold text-teal hover:underline">
                {t("myOrders")}
              </Link>
            </p>
          ) : canWrite ? (
            <form
              onSubmit={submit}
              className="space-y-3 rounded-2xl border border-night/8 bg-white/70 p-5 lg:p-6"
            >
              <p className="text-sm font-bold text-night">{t("writeReview")}</p>
              <p className="text-xs text-teal">{t("verifiedPurchaseHint")}</p>
              <StarPicker value={rating} onChange={setRating} label={t("rating")} />
              <div className="grid gap-3 sm:grid-cols-3">
                <StarPicker value={scoreDelivery} onChange={setScoreDelivery} label={t("scoreDelivery")} />
                <StarPicker value={scoreQuality} onChange={setScoreQuality} label={t("scoreQuality")} />
                <StarPicker value={scoreComms} onChange={setScoreComms} label={t("scoreComms")} />
              </div>
              <input
                className="w-full rounded-xl border border-night/10 bg-surface-muted px-3.5 py-2.5 text-sm outline-none transition focus:border-accent/50 focus:bg-white"
                placeholder={t("reviewTitle")}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={200}
              />
              <textarea
                className="w-full rounded-xl border border-night/10 bg-surface-muted px-3.5 py-2.5 text-sm outline-none transition focus:border-accent/50 focus:bg-white"
                rows={4}
                placeholder={t("reviewBody")}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                required
                maxLength={5000}
              />
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-muted">{t("addPhotos")}</label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  multiple
                  disabled={uploading || mediaUrls.length >= 6}
                  onChange={(e) => {
                    void onPickMedia(e.target.files);
                    e.target.value = "";
                  }}
                  className="block w-full text-xs text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-night/5 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-night"
                />
                {mediaUrls.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {mediaUrls.map((url) => (
                      <button
                        key={url}
                        type="button"
                        onClick={() => setMediaUrls((prev) => prev.filter((u) => u !== url))}
                        className="relative"
                        title={t("removePhoto")}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="" className="h-14 w-14 rounded-lg object-cover ring-1 ring-night/10" />
                      </button>
                    ))}
                  </div>
                ) : null}
                {uploading ? <p className="mt-1 text-xs text-muted">{t("uploading")}</p> : null}
              </div>
              <button
                type="submit"
                disabled={sending || uploading}
                className="w-full rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-night transition hover:bg-accent-hover disabled:opacity-50"
              >
                {t("submitReview")}
              </button>
              {msg ? (
                <p className={`text-sm ${msgOk ? "text-teal" : "text-rose-600"}`}>{msg}</p>
              ) : null}
            </form>
          ) : (
            <div className="h-24 animate-pulse rounded-2xl bg-night/5" />
          )}
        </aside>
      </div>
    </section>
  );
}
