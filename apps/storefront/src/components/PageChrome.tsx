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
        {subtitle ? <p className="mt-1.5 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  actionHref,
  actionLabel,
}: {
  title: string;
  description?: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="px-4 py-16 text-center sm:py-20">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-teal/10 text-teal">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
          <path d="M6 7h15l-1.5 9H8L6 7z" strokeLinejoin="round" />
          <path d="M6 7 5 4H2" strokeLinecap="round" />
          <circle cx="9" cy="20" r="1" fill="currentColor" stroke="none" />
          <circle cx="18" cy="20" r="1" fill="currentColor" stroke="none" />
        </svg>
      </div>
      <p className="mt-5 font-display text-lg font-bold text-night">{title}</p>
      {description ? <p className="mx-auto mt-2 max-w-sm text-sm text-muted">{description}</p> : null}
      {actionHref && actionLabel ? (
        <Link
          href={actionHref}
          className="mt-7 inline-block rounded-xl bg-accent px-6 py-3 text-sm font-bold text-night transition hover:bg-accent-hover"
        >
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-800",
  confirmed: "bg-sky-50 text-sky-800",
  processing: "bg-indigo-50 text-indigo-800",
  shipped: "bg-violet-50 text-violet-800",
  delivered: "bg-teal/10 text-teal",
  completed: "bg-teal/10 text-teal",
  cancelled: "bg-rose-50 text-rose-700",
  paid: "bg-teal/10 text-teal",
  unpaid: "bg-amber-50 text-amber-800",
};

export function StatusBadge({ status, label }: { status: string; label: string }) {
  const style = STATUS_STYLE[status] || "bg-night/5 text-night/70";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${style}`}>
      {label}
    </span>
  );
}
