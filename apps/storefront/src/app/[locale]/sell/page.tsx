"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";

export default function SellPage() {
  const t = useTranslations("sell");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState("");
  const [ok, setOk] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setOk(false);
    try {
      await api("/v1/vendors/apply", {
        method: "POST",
        body: JSON.stringify({ name, slug, description }),
      });
      setOk(true);
      setMessage(t("success"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("error"));
    }
  }

  const benefits = [t("benefit1"), t("benefit2"), t("benefit3")];

  return (
    <div className="animate-rise">
      <div className="grid gap-10 lg:grid-cols-2 lg:items-start">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-night sm:text-3xl">{t("title")}</h1>
          <p className="mt-2 text-night/65">{t("sub")}</p>
          <ul className="mt-8 space-y-3">
            {benefits.map((b) => (
              <li
                key={b}
                className="flex gap-3 rounded-2xl border border-night/8 bg-white px-4 py-3.5 text-sm font-medium text-night shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
              >
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-bold text-night">
                  ✓
                </span>
                {b}
              </li>
            ))}
          </ul>
        </div>

        <form
          onSubmit={submit}
          className="rounded-2xl border border-night/8 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:p-6"
        >
          <label className="block text-sm font-medium text-night">
            {t("storeName")}
            <input
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-night/10 bg-[#f8f8fa] px-3.5 py-2.5 text-sm outline-none focus:border-accent/40 focus:bg-white"
            />
          </label>
          <label className="mt-4 block text-sm font-medium text-night">
            {t("storeSlug")}
            <input
              required
              pattern="[a-z0-9-]+"
              value={slug}
              onChange={(event) => setSlug(event.target.value.toLowerCase())}
              className="mt-1.5 w-full rounded-xl border border-night/10 bg-[#f8f8fa] px-3.5 py-2.5 text-sm outline-none focus:border-accent/40 focus:bg-white"
            />
          </label>
          <label className="mt-4 block text-sm font-medium text-night">
            {t("description")}
            <textarea
              required
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              className="mt-1.5 min-h-28 w-full rounded-xl border border-night/10 bg-[#f8f8fa] px-3.5 py-2.5 text-sm outline-none focus:border-accent/40 focus:bg-white"
            />
          </label>
          <button
            type="submit"
            className="mt-6 w-full rounded-xl bg-accent py-3.5 text-sm font-bold text-night transition hover:bg-accent-hover"
          >
            {t("submit")}
          </button>
          {message ? (
            <p className={`mt-4 text-sm ${ok ? "text-teal" : "text-rose-700"}`}>{message}</p>
          ) : null}
        </form>
      </div>
    </div>
  );
}
