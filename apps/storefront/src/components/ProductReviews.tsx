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

export function ProductReviews({ productId }: { productId: string; locale?: string }) {
  const t = useTranslations("product");
  const locale = useLocale();
  const [items, setItems] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const d = await api<{ items: Review[] }>(`/v1/products/${productId}/reviews`);
      setItems(d.items || []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setLoggedIn(Boolean(localStorage.getItem("access_token")));
    load();
  }, [productId]);

  const avg =
    items.length > 0 ? items.reduce((a, r) => a + (r.rating || 0), 0) / items.length : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSending(true);
    setMsg("");
    try {
      await api(`/v1/products/${productId}/reviews`, {
        method: "POST",
        body: JSON.stringify({ rating, title, body }),
      });
      setTitle("");
      setBody("");
      setRating(5);
      setMsg(t("reviewSent"));
      await load();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : t("reviewError"));
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="mt-12 border-t border-night/8 pt-10 sm:mt-16 sm:pt-12 lg:mt-20 lg:pt-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="font-display text-xl font-bold text-night sm:text-2xl">{t("reviews")}</h2>
        {avg != null ? (
          <div className="flex items-center gap-2 text-sm text-muted">
            <Stars value={Math.round(avg)} size={16} />
            <span className="font-bold text-night">{avg.toFixed(1)}</span>
            <span>· {t("reviewsCount", { count: items.length })}</span>
          </div>
        ) : null}
      </div>

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
                return (
                  <li
                    key={r.id || i}
                    className="rounded-2xl border border-night/6 bg-white/50 px-4 py-4 lg:px-5 lg:py-5"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Stars value={r.rating} />
                      {r.title ? <p className="text-sm font-semibold text-night">{r.title}</p> : null}
                    </div>
                    {(author || date) && (
                      <p className="mt-1 text-xs text-muted">
                        {[author, date].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    {r.body ? <p className="mt-2 text-sm leading-relaxed text-night/75">{r.body}</p> : null}
                  </li>
                );
              })}
              {items.length === 0 && (
                <p className="py-8 text-center text-sm text-muted lg:py-12">{t("noReviews")}</p>
              )}
            </ul>
          )}
        </div>

        <aside className="mt-8 lg:mt-0 lg:sticky lg:top-28">
          {loggedIn ? (
            <form
              onSubmit={submit}
              className="space-y-3 rounded-2xl border border-night/8 bg-white/70 p-5 lg:p-6"
            >
              <p className="text-sm font-bold text-night">{t("writeReview")}</p>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{t("rating")}</p>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setRating(n)}
                      className="rounded-lg p-1 transition hover:bg-night/4"
                      aria-label={`${n}`}
                    >
                      <svg
                        width="22"
                        height="22"
                        viewBox="0 0 24 24"
                        className={n <= rating ? "text-saffron" : "text-night/20"}
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
              <input
                className="w-full rounded-xl border border-night/10 bg-surface-muted px-3.5 py-2.5 text-sm outline-none transition focus:border-accent/50 focus:bg-white"
                placeholder={t("reviewTitle")}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <textarea
                className="w-full rounded-xl border border-night/10 bg-surface-muted px-3.5 py-2.5 text-sm outline-none transition focus:border-accent/50 focus:bg-white"
                rows={4}
                placeholder={t("reviewBody")}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                required
              />
              <button
                type="submit"
                disabled={sending}
                className="w-full rounded-xl bg-accent px-5 py-2.5 text-sm font-bold text-night transition hover:bg-accent-hover disabled:opacity-50"
              >
                {t("submitReview")}
              </button>
              {msg ? <p className="text-sm text-muted">{msg}</p> : null}
            </form>
          ) : (
            <p className="rounded-2xl border border-night/8 bg-white/60 px-5 py-4 text-sm text-muted">
              {t("loginToReview")}{" "}
              <Link href={`/${locale}/account`} className="font-semibold text-teal hover:underline">
                {t("loginLink")}
              </Link>
            </p>
          )}
        </aside>
      </div>
    </section>
  );
}
