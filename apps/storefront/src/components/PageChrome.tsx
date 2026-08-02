import Link from "next/link";
import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-bold tracking-tight text-night sm:text-3xl">{title}</h1>
        {subtitle ? <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

type EmptyVariant = "cart" | "search" | "wishlist" | "generic";

function EmptyIcon({ variant }: { variant: EmptyVariant }) {
  if (variant === "search") {
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        <circle cx="11" cy="11" r="6.5" />
        <path d="M16.5 16.5 20 20" strokeLinecap="round" />
      </svg>
    );
  }
  if (variant === "wishlist") {
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        <path d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 11c0 5.5-7 10-7 10z" strokeLinejoin="round" />
      </svg>
    );
  }
  if (variant === "generic") {
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        <path d="M4 7h16v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7z" strokeLinejoin="round" />
        <path d="M8 7V5a4 4 0 0 1 8 0v2" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M6 7h15l-1.5 9H8L6 7z" strokeLinejoin="round" />
      <path d="M6 7 5 4H2" strokeLinecap="round" />
      <circle cx="9" cy="20" r="1" fill="currentColor" stroke="none" />
      <circle cx="18" cy="20" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function EmptyState({
  title,
  description,
  actionHref,
  actionLabel,
  onAction,
  variant = "cart",
}: {
  title: string;
  description?: string;
  actionHref?: string;
  actionLabel?: string;
  onAction?: () => void;
  variant?: EmptyVariant;
}) {
  const btnClass =
    "mt-7 inline-flex min-h-11 items-center justify-center rounded-xl bg-accent px-6 py-3 text-sm font-bold text-night transition hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal";
  return (
    <div className="px-4 py-16 text-center sm:py-20">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-teal/10 text-teal">
        <EmptyIcon variant={variant} />
      </div>
      <p className="mt-5 font-display text-lg font-bold text-night sm:text-xl">{title}</p>
      {description ? <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">{description}</p> : null}
      {actionHref && actionLabel ? (
        <Link href={actionHref} className={btnClass}>
          {actionLabel}
        </Link>
      ) : onAction && actionLabel ? (
        <button type="button" onClick={onAction} className={btnClass}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

/** Brand-aligned status chips — teal/saffron/danger family, avoid indigo/violet SaaS. */
const STATUS_STYLE: Record<string, string> = {
  pending: "bg-saffron/15 text-saffron-700",
  confirmed: "bg-teal/10 text-teal-800",
  processing: "bg-teal/10 text-teal-800",
  shipped: "bg-night/8 text-night/80",
  delivered: "bg-teal/10 text-teal",
  completed: "bg-teal/10 text-teal",
  cancelled: "bg-danger-muted text-danger",
  paid: "bg-teal/10 text-teal",
  unpaid: "bg-saffron/15 text-saffron-700",
  refunded: "bg-night/8 text-night/70",
};

export function StatusBadge({ status, label }: { status: string; label: string }) {
  const style = STATUS_STYLE[status] || "bg-night/5 text-night/70";
  return (
    <span className={`inline-flex rounded-lg px-2.5 py-0.5 text-xs font-semibold ${style}`}>
      {label}
    </span>
  );
}

const retryBtnClass =
  "mt-7 inline-flex min-h-11 items-center justify-center rounded-xl bg-accent px-6 py-3 text-sm font-bold text-night transition hover:bg-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal";

/** Inline error panel with optional retry — matches search page pattern. */
export function ErrorPanel({
  title,
  description,
  onRetry,
  retryLabel,
}: {
  title: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div className="px-4 py-16 text-center sm:py-20">
      <p className="font-display text-lg font-bold text-night sm:text-xl">{title}</p>
      {description ? <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">{description}</p> : null}
      {onRetry && retryLabel ? (
        <button type="button" onClick={onRetry} className={retryBtnClass}>
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}

/** Generic list/card loading skeleton. */
export function LoadingBlock({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-24 animate-pulse rounded-2xl bg-night/5" />
      ))}
    </div>
  );
}

/** Product grid loading skeleton — shared across catalog/search. */
export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="mt-8 grid animate-pulse grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-2">
          <div className="aspect-[3/4] rounded-2xl bg-night/8" />
          <div className="h-3 w-2/3 rounded bg-night/10" />
        </div>
      ))}
    </div>
  );
}

/** Vertical order status timeline — pending → delivered. */
export function StatusTimeline({
  steps,
  currentStatus,
  label,
}: {
  steps: readonly string[];
  currentStatus: string;
  label: (status: string) => string;
}) {
  const terminal = currentStatus === "cancelled" || currentStatus === "refunded";
  const statusIdx = terminal ? -1 : steps.indexOf(currentStatus);

  return (
    <ol className="relative mt-4 space-y-0">
      {steps.map((step, i) => {
        const done = !terminal && statusIdx >= 0 && i <= statusIdx;
        const current = !terminal && currentStatus === step;
        const upcoming = !done && !current;
        const isLast = i === steps.length - 1;
        return (
          <li key={step} className="relative flex gap-3 pb-5 last:pb-0">
            {!isLast ? (
              <span
                className={`absolute start-[11px] top-6 h-[calc(100%-12px)] w-0.5 ${
                  done ? "bg-teal/40" : "bg-night/8"
                }`}
                aria-hidden
              />
            ) : null}
            <span
              className={`relative z-[1] flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                current
                  ? "bg-accent text-night ring-2 ring-accent/30"
                  : done
                    ? "bg-teal text-paper"
                    : "border border-night/12 bg-white text-night/30"
              }`}
              aria-hidden
            >
              {done && !current ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                i + 1
              )}
            </span>
            <div className="min-w-0 pt-0.5">
              <p
                className={`text-sm font-semibold ${
                  current ? "text-night" : done ? "text-teal" : upcoming ? "text-night/40" : "text-night/70"
                }`}
              >
                {label(step)}
              </p>
            </div>
          </li>
        );
      })}
      {terminal ? (
        <li className="relative flex gap-3 pt-1">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-danger-muted text-danger">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </span>
          <p className="pt-0.5 text-sm font-semibold text-danger">{label(currentStatus)}</p>
        </li>
      ) : null}
    </ol>
  );
}
