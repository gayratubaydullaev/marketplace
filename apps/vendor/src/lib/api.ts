import {
  clientRoleHint,
  gatewayPath,
  hasClientSessionFlag,
  logoutSession,
  probeSession,
  type SessionProbe,
} from "@gayrat/web-session/client";

export const TENANT =
  process.env.NEXT_PUBLIC_TENANT_ID || "00000000-0000-0000-0000-000000000001";

export const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8080").replace(/\/$/, "");

export const STOREFRONT_URL = (process.env.NEXT_PUBLIC_STOREFRONT_URL || "http://localhost:3000").replace(
  /\/$/,
  ""
);

const SESSION_PREFIX = "gv";
const VENDOR_ROLES = new Set(["vendor", "tenant_admin"]);

function resolve(path: string) {
  const p = path.startsWith("/") ? path : `/${path}`;
  if (typeof window !== "undefined") return gatewayPath(p);
  return `${API_BASE}${p}`;
}

export function isVendorRole(role: unknown): boolean {
  return typeof role === "string" && VENDOR_ROLES.has(role);
}

export function hasVendorSessionHint(): boolean {
  return hasClientSessionFlag(SESSION_PREFIX) && isVendorRole(clientRoleHint(SESSION_PREFIX));
}

export async function clearTokens() {
  await logoutSession();
}

export async function probeSessionSafe(): Promise<SessionProbe> {
  return probeSession();
}

export async function ensureVendorSession(): Promise<boolean> {
  const s = await probeSession();
  return Boolean(s.authenticated && isVendorRole(s.role));
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  headers.set("X-Tenant-ID", TENANT);
  headers.delete("Authorization");
  headers.delete("X-Internal-Key");

  const res = await fetch(resolve(path), {
    ...init,
    headers,
    cache: "no-store",
    credentials: typeof window !== "undefined" ? "same-origin" : "omit",
  });

  if (!res.ok) throw new Error(await res.text());
  if (res.status === 204) return undefined as T;
  return res.json();
}

export function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message.length > 200 ? e.message.slice(0, 200) + "…" : e.message;
  return String(e);
}
