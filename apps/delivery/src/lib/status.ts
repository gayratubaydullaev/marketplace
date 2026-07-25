export function statusLabel(t: (key: string) => string, status: string) {
  const key = `status_${status}`;
  const label = t(key);
  return label !== key ? label : status;
}

export function statusBadgeClass(status: string): string {
  switch (status) {
    case "assigned":
      return "bg-amber-100 text-amber-900";
    case "accepted":
    case "at_pickup":
      return "bg-teal/15 text-teal-800";
    case "picked_up":
    case "in_transit":
      return "bg-sky-100 text-sky-900";
    case "delivered":
      return "bg-emerald-100 text-emerald-800";
    case "cancelled":
      return "bg-rose-100 text-rose-800";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

export function money(amount: number, currency = "UZS", locale = "ru-RU") {
  return `${(amount || 0).toLocaleString(locale)} ${currency}`;
}

export const JOB_STEPS = ["assigned", "accepted", "at_pickup", "picked_up", "in_transit", "delivered"] as const;

export function stepIndex(status: string) {
  const i = JOB_STEPS.indexOf(status as (typeof JOB_STEPS)[number]);
  return i < 0 ? 0 : i;
}

export const SHIFT_EVENT = "courier:shift";

export function emitShiftChange(onShift: boolean) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SHIFT_EVENT, { detail: { onShift } }));
}
