export const TENANT =
  process.env.NEXT_PUBLIC_TENANT_ID || "00000000-0000-0000-0000-000000000001";

export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8080").replace(/\/$/, "");

export const STOREFRONT_URL = (process.env.NEXT_PUBLIC_STOREFRONT_URL || "http://localhost:3000").replace(
  /\/$/,
  ""
);

const VENDOR_ROLES = new Set(["vendor", "tenant_admin"]);

function resolve(path: string) {
  return `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

export function getToken() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("access_token") || localStorage.getItem("vendor_token") || "";
}

export function clearTokens() {
  localStorage.removeItem("access_token");
  localStorage.removeItem("vendor_token");
  localStorage.removeItem("admin_token");
  localStorage.removeItem("refresh_token");
}

export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function isVendorRole(role: unknown): boolean {
  return typeof role === "string" && VENDOR_ROLES.has(role);
}

export function tokenHasVendorRole(token = getToken()): boolean {
  if (!token) return false;
  const payload = decodeJwtPayload(token);
  return isVendorRole(payload?.role);
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  headers.set("X-Tenant-ID", TENANT);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(resolve(path), { ...init, headers, cache: "no-store" });
  if (!res.ok) throw new Error(await res.text());
  if (res.status === 204) return undefined as T;
  return res.json();
}

export function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message.length > 200 ? e.message.slice(0, 200) + "…" : e.message;
  return String(e);
}
