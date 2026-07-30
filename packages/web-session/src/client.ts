/** Soft UI signal that httpOnly session cookies exist (not a secret). */
export function hasClientSessionFlag(prefix: string): boolean {
  if (typeof document === "undefined") return false;
  const re = new RegExp(`(?:^|; )${prefix}_session=1(?:;|$)`);
  return re.test(document.cookie);
}

/** Non-secret role hint cookie set by BFF after login. */
export function clientRoleHint(prefix: string): string {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(new RegExp(`(?:^|; )${prefix}_role=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : "";
}

export async function logoutSession(): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    await fetch("/api/auth/session", { method: "DELETE", cache: "no-store", credentials: "same-origin" });
  } catch {
    /* ignore */
  }
  // Legacy cleanup
  try {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("admin_token");
    localStorage.removeItem("vendor_token");
    localStorage.removeItem("courier_token");
  } catch {
    /* ignore */
  }
}

export type SessionProbe = {
  authenticated: boolean;
  role: string | null;
  user?: { id?: string; email?: string; role?: string };
};

export async function probeSession(): Promise<SessionProbe> {
  try {
    const res = await fetch("/api/auth/session", { cache: "no-store", credentials: "same-origin" });
    if (!res.ok) return { authenticated: false, role: null };
    return (await res.json()) as SessionProbe;
  } catch {
    return { authenticated: false, role: null };
  }
}

export function gatewayPath(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  if (p.startsWith("/v1/")) return `/api/gateway${p.slice(3)}`;
  return `/api/gateway${p}`;
}
