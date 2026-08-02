import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  HTMLAttributes,
  PropsWithChildren,
  ReactNode,
  SelectHTMLAttributes,
} from "react";

function cx(...parts: Array<string | undefined | false | null>) {
  return parts.filter(Boolean).join(" ");
}

export function Button({
  children,
  variant = "primary",
  ...props
}: PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }
>) {
  const styles =
    variant === "secondary"
      ? "border border-slate-200 bg-white text-slate-900 hover:bg-slate-50"
      : variant === "ghost"
        ? "bg-transparent text-slate-800 hover:bg-slate-100"
        : variant === "danger"
          ? "bg-rose-600 text-white hover:bg-rose-700"
          : "bg-teal-700 text-white hover:bg-teal-800";
  return (
    <button
      {...props}
      className={cx(
        "inline-flex items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
        styles,
        props.className,
      )}
    >
      {children}
    </button>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cx(
        "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20",
        props.className,
      )}
    />
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cx(
        "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20",
        props.className,
      )}
    />
  );
}

export function Badge({
  children,
  tone = "neutral",
  ...props
}: PropsWithChildren<
  HTMLAttributes<HTMLSpanElement> & { tone?: "neutral" | "success" | "warning" | "danger" | "info" }
>) {
  const styles =
    tone === "success"
      ? "bg-emerald-100 text-emerald-800"
      : tone === "warning"
        ? "bg-amber-100 text-amber-900"
        : tone === "danger"
          ? "bg-rose-100 text-rose-800"
          : tone === "info"
            ? "bg-sky-100 text-sky-800"
            : "bg-slate-100 text-slate-700";
  return (
    <span
      {...props}
      className={cx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", styles, props.className)}
    >
      {children}
    </span>
  );
}

export function Card({ children, ...props }: PropsWithChildren<HTMLAttributes<HTMLDivElement>>) {
  return (
    <div
      {...props}
      className={cx("rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5", props.className)}
    >
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-slate-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function FormField({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      {children}
      {hint ? <span className="block text-xs text-slate-400">{hint}</span> : null}
    </label>
  );
}

export function EmptyState({
  text,
  title,
  action,
}: {
  text: string;
  title?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center">
      {title ? <p className="mb-1 text-sm font-semibold text-slate-800">{title}</p> : null}
      <p className="text-sm text-slate-500">{text}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function TableShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("overflow-x-auto rounded-2xl border border-slate-200/80 bg-white shadow-sm", className)}>
      <table className="min-w-full text-left text-sm">{children}</table>
    </div>
  );
}

export function StatusBadge({
  status,
  label,
  toneMap,
}: {
  status?: string;
  label?: string;
  toneMap?: Record<string, "neutral" | "success" | "warning" | "danger" | "info">;
}) {
  const key = (status || "").toLowerCase();
  const tone =
    toneMap?.[key] ||
    (key.includes("paid") || key.includes("active") || key.includes("deliver") || key.includes("success") || key === "approved"
      ? "success"
      : key.includes("pending") || key.includes("wait") || key.includes("draft")
        ? "warning"
        : key.includes("cancel") || key.includes("fail") || key.includes("reject") || key.includes("error")
          ? "danger"
          : key.includes("ship") || key.includes("transit") || key.includes("assign")
            ? "info"
            : "neutral");
  return <Badge tone={tone}>{label || status || "—"}</Badge>;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        {description ? <p className="mt-2 text-sm text-slate-600">{description}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button type="button" variant={danger ? "danger" : "primary"} onClick={onConfirm} disabled={busy}>
            {busy ? "…" : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function Msg({
  text,
  tone = "error",
  onRetry,
  retryLabel = "Retry",
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
    <div className={cx("mb-3 flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm", styles)} role="status">
      <span className="min-w-0 break-words">{text}</span>
      {onRetry ? (
        <button type="button" className="shrink-0 font-semibold underline" onClick={onRetry}>
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-center gap-3 text-sm">
      <button
        type="button"
        disabled={page <= 1}
        className="rounded-full border border-slate-200 bg-white px-3 py-1.5 disabled:opacity-40"
        onClick={() => onPage(page - 1)}
        aria-label="Previous page"
      >
        ←
      </button>
      <span className="tabular-nums text-slate-600">
        {page} / {pages}
      </span>
      <button
        type="button"
        disabled={page >= pages}
        className="rounded-full border border-slate-200 bg-white px-3 py-1.5 disabled:opacity-40"
        onClick={() => onPage(page + 1)}
        aria-label="Next page"
      >
        →
      </button>
    </div>
  );
}

export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500" aria-busy="true">
      {label}
    </div>
  );
}

export function KpiCard({
  label,
  value,
  href,
  hint,
}: {
  label: string;
  value: string | number;
  href?: string;
  hint?: string;
}) {
  const body = (
    <>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-400">{hint}</p> : null}
    </>
  );
  if (href) {
    return (
      <a href={href} className="block rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:border-teal-600/40">
        {body}
      </a>
    );
  }
  return <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">{body}</div>;
}

export { cx };
export { formatApiError, readApiError, type ApiErrorShape } from "./feedback";
