"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api";

type Step = 1 | 2 | 3;

export default function SellPage() {
  const t = useTranslations("sell");
  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [kycNotes, setKycNotes] = useState("");
  const [kycDocs, setKycDocs] = useState("");
  const [message, setMessage] = useState("");
  const [ok, setOk] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const benefits = [t("benefit1"), t("benefit2"), t("benefit3")];
  const steps = [t("stepShop"), t("stepDocs"), t("stepReview")] as const;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setOk(false);
    setSubmitting(true);
    try {
      const kycDocuments = kycDocs
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((url) => ({ type: "document", url, notes: kycNotes || undefined }));
      await api("/v1/vendors/apply", {
        method: "POST",
        body: JSON.stringify({
          name,
          slug,
          description,
          bank_details: {
            bank_name: bankName || undefined,
            bank_account: bankAccount || undefined,
          },
          kyc_documents: kycDocuments.length > 0 ? kycDocuments : kycNotes ? [{ type: "note", notes: kycNotes }] : [],
        }),
      });
      setOk(true);
      setMessage(t("success"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("error"));
    } finally {
      setSubmitting(false);
    }
  }

  function nextStep() {
    if (step < 3) setStep((step + 1) as Step);
  }

  function prevStep() {
    if (step > 1) setStep((step - 1) as Step);
  }

  return (
    <div className="animate-rise">
      <div className="grid gap-10 lg:grid-cols-2 lg:items-start">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-night sm:text-3xl">{t("title")}</h1>
          <p className="mt-2 text-night/65">{t("sub")}</p>
          <ol className="mt-6 flex gap-2">
            {steps.map((label, i) => {
              const n = (i + 1) as Step;
              const active = step === n;
              const done = step > n;
              return (
                <li
                  key={label}
                  className={`flex-1 rounded-xl border px-3 py-2 text-center text-xs font-semibold ${
                    active
                      ? "border-accent bg-accent/10 text-night"
                      : done
                        ? "border-teal/30 bg-teal/5 text-teal"
                        : "border-night/8 bg-white text-night/45"
                  }`}
                >
                  {label}
                </li>
              );
            })}
          </ol>
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
          onSubmit={step === 3 ? submit : (e) => { e.preventDefault(); nextStep(); }}
          className="rounded-2xl border border-night/8 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:p-6"
        >
          {step === 1 && (
            <>
              <h2 className="text-lg font-semibold text-night">{t("stepShop")}</h2>
              <label className="mt-4 block text-sm font-medium text-night">
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
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="text-lg font-semibold text-night">{t("stepDocs")}</h2>
              <p className="mt-1 text-sm text-night/55">{t("stepDocsHint")}</p>
              <label className="mt-4 block text-sm font-medium text-night">
                {t("bankName")}
                <input
                  value={bankName}
                  onChange={(event) => setBankName(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-night/10 bg-[#f8f8fa] px-3.5 py-2.5 text-sm outline-none focus:border-accent/40 focus:bg-white"
                />
              </label>
              <label className="mt-4 block text-sm font-medium text-night">
                {t("bankAccount")}
                <input
                  value={bankAccount}
                  onChange={(event) => setBankAccount(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-night/10 bg-[#f8f8fa] px-3.5 py-2.5 text-sm outline-none focus:border-accent/40 focus:bg-white"
                />
              </label>
              <label className="mt-4 block text-sm font-medium text-night">
                {t("kycNotes")}
                <textarea
                  value={kycNotes}
                  onChange={(event) => setKycNotes(event.target.value)}
                  placeholder={t("kycNotesPlaceholder")}
                  className="mt-1.5 min-h-20 w-full rounded-xl border border-night/10 bg-[#f8f8fa] px-3.5 py-2.5 text-sm outline-none focus:border-accent/40 focus:bg-white"
                />
              </label>
              <label className="mt-4 block text-sm font-medium text-night">
                {t("kycDocs")}
                <textarea
                  value={kycDocs}
                  onChange={(event) => setKycDocs(event.target.value)}
                  placeholder={t("kycDocsPlaceholder")}
                  className="mt-1.5 min-h-20 w-full rounded-xl border border-night/10 bg-[#f8f8fa] px-3.5 py-2.5 text-sm outline-none focus:border-accent/40 focus:bg-white"
                />
              </label>
            </>
          )}

          {step === 3 && (
            <>
              <h2 className="text-lg font-semibold text-night">{t("stepReview")}</h2>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="rounded-xl bg-[#f8f8fa] px-3.5 py-2.5">
                  <dt className="text-night/50">{t("storeName")}</dt>
                  <dd className="font-medium text-night">{name}</dd>
                </div>
                <div className="rounded-xl bg-[#f8f8fa] px-3.5 py-2.5">
                  <dt className="text-night/50">{t("storeSlug")}</dt>
                  <dd className="font-medium text-night">{slug}</dd>
                </div>
                <div className="rounded-xl bg-[#f8f8fa] px-3.5 py-2.5">
                  <dt className="text-night/50">{t("description")}</dt>
                  <dd className="text-night">{description}</dd>
                </div>
                {(bankName || bankAccount) && (
                  <div className="rounded-xl bg-[#f8f8fa] px-3.5 py-2.5">
                    <dt className="text-night/50">{t("bankName")}</dt>
                    <dd className="text-night">
                      {bankName} {bankAccount ? `· ${bankAccount}` : ""}
                    </dd>
                  </div>
                )}
                {kycNotes && (
                  <div className="rounded-xl bg-[#f8f8fa] px-3.5 py-2.5">
                    <dt className="text-night/50">{t("kycNotes")}</dt>
                    <dd className="text-night">{kycNotes}</dd>
                  </div>
                )}
              </dl>
            </>
          )}

          <div className="mt-6 flex gap-3">
            {step > 1 && !ok && (
              <button
                type="button"
                onClick={prevStep}
                className="flex-1 rounded-xl border border-night/10 py-3.5 text-sm font-semibold text-night transition hover:bg-night/5"
              >
                {t("back")}
              </button>
            )}
            <button
              type="submit"
              disabled={submitting || ok}
              className="flex-1 rounded-xl bg-accent py-3.5 text-sm font-bold text-night transition hover:bg-accent-hover disabled:opacity-60"
            >
              {step === 3 ? (submitting ? t("submitting") : t("submit")) : t("next")}
            </button>
          </div>
          {message ? (
            <p className={`mt-4 text-sm ${ok ? "text-teal" : "text-rose-700"}`}>{message}</p>
          ) : null}
        </form>
      </div>
    </div>
  );
}
