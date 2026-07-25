"use client";

import { statusBadgeClass, statusLabel } from "@/lib/status";
import { useI18n } from "@/lib/i18n";

export function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n();
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusBadgeClass(status)}`}>
      {statusLabel(t, status)}
    </span>
  );
}
