"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* fall through — often fails on non-HTTPS (LAN IP) */
    }
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.left = "0";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function isAbortError(err: unknown) {
  return (
    (err instanceof DOMException && err.name === "AbortError") ||
    (typeof err === "object" &&
      err !== null &&
      "name" in err &&
      (err as { name: string }).name === "AbortError")
  );
}

export function ProductShareButton({
  title,
  url,
  className = "",
}: {
  title: string;
  /** Absolute or path URL; defaults to current page. */
  url?: string;
  className?: string;
}) {
  const t = useTranslations("product");
  const [copied, setCopied] = useState(false);

  function flashCopied() {
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function share(e?: React.MouseEvent) {
    e?.preventDefault();
    e?.stopPropagation();

    const href =
      url ||
      (typeof window !== "undefined" ? window.location.href : "");
    if (!href) return;

    const absolute =
      href.startsWith("http") || typeof window === "undefined"
        ? href
        : new URL(href, window.location.origin).toString();

    // Native share when available (phones). Skip if user cancels.
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title, text: title, url: absolute });
        return;
      } catch (err) {
        if (isAbortError(err)) return;
        /* share failed — fall through to copy */
      }
    }

    const ok = await copyToClipboard(absolute);
    if (ok) flashCopied();
  }

  return (
    <button
      type="button"
      onClick={(e) => void share(e)}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      aria-label={copied ? t("linkCopied") : t("share")}
      title={copied ? t("linkCopied") : t("share")}
      className={`flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-night shadow-[0_2px_8px_rgba(0,0,0,0.12)] backdrop-blur-sm transition hover:scale-105 hover:text-teal ${
        copied ? "text-teal" : ""
      } ${className}`}
    >
      {copied ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
          <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <circle cx="18" cy="5" r="2.5" />
          <circle cx="6" cy="12" r="2.5" />
          <circle cx="18" cy="19" r="2.5" />
          <path d="M8.4 13.2l7.2 4.1M15.6 6.7l-7.2 4.1" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}
