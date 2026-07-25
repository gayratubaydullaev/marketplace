export const DELIVERY_STATUSES = [
  "pending_assign",
  "assigned",
  "accepted",
  "at_pickup",
  "picked_up",
  "in_transit",
  "delivered",
  "cancelled",
] as const;

export function deliveryStatusKey(status: string): string {
  return `delStatus_${status}`;
}

export function deliveryStatusLabel(t: (key: string) => string, status: string): string {
  const key = deliveryStatusKey(status);
  const label = t(key);
  return label !== key ? label : status;
}

export function statusBadgeTone(status?: string): string {
  const s = (status || "").toLowerCase();
  switch (s) {
    case "pending_assign":
    case "pending":
    case "draft":
    case "unpaid":
      return "bg-amber-50 text-amber-800";
    case "assigned":
    case "accepted":
    case "at_pickup":
    case "processing":
      return "bg-teal/15 text-teal-900";
    case "picked_up":
    case "in_transit":
    case "shipped":
      return "bg-sky-100 text-sky-900";
    case "delivered":
    case "completed":
    case "paid":
    case "active":
    case "approved":
      return "bg-emerald-50 text-emerald-800";
    case "cancelled":
    case "rejected":
    case "blocked":
    case "failed":
    case "suspended":
      return "bg-rose-50 text-rose-800";
    default:
      if (s.includes("cancel") || s.includes("reject") || s.includes("block") || s.includes("fail")) {
        return "bg-rose-50 text-rose-800";
      }
      if (s.includes("pending") || s.includes("unpaid")) return "bg-amber-50 text-amber-800";
      if (s.includes("active") || s.includes("paid") || s.includes("deliver")) return "bg-emerald-50 text-emerald-800";
      return "bg-slate-100 text-slate-600";
  }
}
