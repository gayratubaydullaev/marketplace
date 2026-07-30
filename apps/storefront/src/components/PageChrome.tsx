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
