import {
  PageHeader as SharedPageHeader,
  FormField,
  Select as SharedSelect,
  TableShell as SharedTableShell,
  EmptyState as SharedEmptyState,
  Pagination as SharedPagination,
  Msg as SharedMsg,
  ConfirmDialog,
  LoadingBlock,
  KpiCard,
  Button,
  Input,
  Badge,
  Card,
  formatApiError,
  readApiError,
} from "@gayrat/ui";
import { statusBadgeTone } from "@/lib/status";

export {
  ConfirmDialog,
  LoadingBlock,
  KpiCard,
  Button,
  Input,
  Badge,
  Card,
  formatApiError,
  readApiError,
  FormField,
};

export function PageHeader(props: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return <SharedPageHeader {...props} />;
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <FormField label={label}>{children}</FormField>;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <SharedSelect {...props} />;
}

export function TableShell({ children }: { children: React.ReactNode }) {
  return <SharedTableShell>{children}</SharedTableShell>;
}

export function EmptyState({ text }: { text: string }) {
  return <SharedEmptyState text={text} />;
}

export function StatusBadge({ status, label }: { status?: string; label?: string }) {
  const tone = statusBadgeTone(status);
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone}`}>
      {label || status || "—"}
    </span>
  );
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

export function PanelCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <Card className={className}>{children}</Card>;
}

export function Pagination(props: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
}) {
  return <SharedPagination {...props} />;
}

export function Msg({ text, tone = "error" }: { text: string; tone?: "error" | "ok" }) {
  return <SharedMsg text={text} tone={tone} />;
}
