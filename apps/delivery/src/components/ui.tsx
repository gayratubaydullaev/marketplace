"use client";

import type { ReactNode } from "react";

export function EmptyState({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center">
      <p className="text-sm text-slate-500">{text}</p>
      {action}
    </div>
  );
}

export function Msg({
  text,
  tone = "error",
  onRetry,
  retryLabel,
}: {
  text?: string;
  tone?: "error" | "ok";
  onRetry?: () => void;
  retryLabel?: string;
}) {
  if (!text) return null;
  const styles =
    tone === "ok"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : "border-rose-200 bg-rose-50 text-rose-700";
  return (
    <div className={`mb-3 flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm ${styles}`}>
      <span className="min-w-0 break-words">{text}</span>
      {onRetry ? (
        <button type="button" className="shrink-0 font-semibold underline" onClick={onRetry}>
          {retryLabel || "Retry"}
        </button>
      ) : null}
    </div>
  );
}
