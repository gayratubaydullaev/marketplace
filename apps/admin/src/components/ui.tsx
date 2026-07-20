export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-night sm:text-3xl">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-slate-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-teal focus:ring-2 focus:ring-teal/20 ${props.className || ""}`}
    />
  );
}

export function TableShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-white shadow-sm">
      <table className="min-w-full text-left text-sm">{children}</table>
    </div>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
      {text}
    </p>
  );
}

export function StatusBadge({ status }: { status?: string }) {
  const s = (status || "—").toLowerCase();
  const tone =
    s.includes("active") || s.includes("paid") || s.includes("approved") || s.includes("delivered") || s.includes("completed")
      ? "bg-emerald-50 text-emerald-700"
      : s.includes("pending") || s.includes("processing") || s.includes("draft")
        ? "bg-amber-50 text-amber-700"
        : s.includes("cancel") || s.includes("reject") || s.includes("suspend") || s.includes("fail")
          ? "bg-rose-50 text-rose-700"
          : "bg-slate-100 text-slate-600";
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone}`}>{status || "—"}</span>;
}

export function CountPill({ value, alert }: { value: number; alert?: boolean }) {
  return (
    <span
      className={`inline-flex min-w-9 items-center justify-center rounded-full px-2.5 py-1 text-sm font-bold tabular-nums ${
        alert && value > 0 ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700"
      }`}
    >
      {value}
    </span>
  );
}

export function SectionTabs({
  items,
  value,
  onChange,
}: {
  items: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              active ? "bg-night text-white shadow-sm" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export function PanelCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5 ${className}`}>{children}</div>
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

export function Msg({ text, tone = "error" }: { text: string; tone?: "error" | "ok" }) {
  if (!text) return null;
  return (
    <p
      className={`mt-3 rounded-xl px-3 py-2 text-sm break-all ${
        tone === "ok" ? "bg-teal/10 text-teal" : "bg-rose-50 text-rose-700"
      }`}
      role="status"
    >
      {text}
    </p>
  );
}
