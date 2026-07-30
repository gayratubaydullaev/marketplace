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

const SESSION_PREFIX = "gd";

function resolve(path: string) {
  const p = path.startsWith("/") ? path : `/${path}`;
  if (typeof window !== "undefined") return gatewayPath(p);
  return `${API_BASE}${p}`;
}

export function isCourierRole(role: unknown): boolean {
  return role === "courier";
}

export function hasCourierSessionHint(): boolean {
  return hasClientSessionFlag(SESSION_PREFIX) && isCourierRole(clientRoleHint(SESSION_PREFIX));
}

export async function clearTokens() {
  await logoutSession();
}

export async function logout() {
  await logoutSession();
}

export async function probeSessionSafe(): Promise<SessionProbe> {
  return probeSession();
}

export async function ensureCourierSession(): Promise<boolean> {
  const s = await probeSession();
  return Boolean(s.authenticated && isCourierRole(s.role));
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
  let raw = e instanceof Error ? e.message : String(e);
  try {
    const j = JSON.parse(raw) as { error?: string; message?: string };
    if (j.error) raw = j.error;
    else if (j.message) raw = j.message;
  } catch {
    /* keep raw */
  }
  return raw.length > 200 ? raw.slice(0, 200) + "…" : raw;
}

export { mapLinks } from "@gayrat/map/navigation";
export type { MapLinks } from "@gayrat/map/navigation";
