export type Tab = "profile" | "addresses" | "orders";

export type User = {
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  locale?: string;
};

export type Address = {
  id: string;
  label?: string | null;
  full_name?: string | null;
  phone?: string | null;
  region?: string;
  district?: string | null;
  street?: string | null;
  building?: string | null;
  apartment?: string | null;
  lat?: number | null;
  lng?: number | null;
  is_default?: boolean;
};

export type Order = {
  id: string;
  order_number: string;
  status: string;
  total: number;
  created_at?: string;
};

export type AddressForm = {
  label: string;
  full_name: string;
  phone: string;
  region: string;
  district: string;
  street: string;
  building: string;
  apartment: string;
  is_default: boolean;
  lat: number | null;
  lng: number | null;
};

export const fieldClass =
  "mt-1.5 w-full rounded-xl border border-night/10 bg-surface-muted px-3.5 py-2.5 text-sm outline-none transition focus:border-accent/40 focus:bg-white";

export function initials(user: User) {
  const a = (user.first_name || "").trim();
  const b = (user.last_name || "").trim();
  if (a || b) return `${a.slice(0, 1)}${b.slice(0, 1)}`.toUpperCase() || "?";
  return user.email.slice(0, 1).toUpperCase();
}

export function displayName(user: User) {
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  return name || user.email;
}

export function orderStatusLabel(
  t: (key: string) => string,
  status: string
) {
  const key = `status${status.charAt(0).toUpperCase()}${status.slice(1)}`;
  try {
    return t(key);
  } catch {
    return status;
  }
}

/** Only allow same-app relative paths (blocks open redirects). */
export function safeNextPath(raw: string | null, locale: string): string | null {
  if (!raw) return null;
  let path = raw;
  try {
    path = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (!path.startsWith("/") || path.startsWith("//")) return null;
  if (path.includes("://") || path.includes("\\")) return null;
  if (!path.startsWith(`/${locale}`) && !path.startsWith("/")) return null;
  return path;
}
