import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export type SessionConfig = {
  /** Cookie name prefix, e.g. "ga" → ga_access, ga_refresh, ga_session, ga_role */
  prefix: string;
  /** Attach X-Guest-ID (storefront). Staff apps should leave false. */
  withGuest?: boolean;
  apiBase?: string;
  tenantId?: string;
};

function isProd() {
  return process.env.NODE_ENV === "production" || process.env.APP_ENV === "production";
}

function cookieBase(maxAge: number) {
  return {
    httpOnly: true as const,
    secure: isProd(),
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

function flagOptions(maxAge = 60 * 60 * 24 * 30) {
  return {
    httpOnly: false as const,
    secure: isProd(),
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

const BLOCKED = new Set([
  "authorization",
  "x-internal-key",
  "x-guest-id",
  "x-tenant-id",
  "cookie",
  "host",
  "connection",
  "content-length",
]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function names(prefix: string) {
  return {
    access: `${prefix}_access`,
    refresh: `${prefix}_refresh`,
    guest: `${prefix}_guest`,
    flag: `${prefix}_session`,
    role: `${prefix}_role`,
  };
}

function decodeRole(accessToken: string): string {
  try {
    const part = accessToken.split(".")[1];
    if (!part) return "";
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const json =
      typeof Buffer !== "undefined"
        ? Buffer.from(b64, "base64").toString("utf8")
        : atob(b64);
    const payload = JSON.parse(json) as { role?: string };
    return typeof payload.role === "string" ? payload.role : "";
  } catch {
    return "";
  }
}

export function createSession(cfg: SessionConfig) {
  const prefix = cfg.prefix;
  const n = names(prefix);
  const API_BASE = (cfg.apiBase || process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8080").replace(
    /\/$/,
    ""
  );
  const TENANT =
    cfg.tenantId ||
    process.env.NEXT_PUBLIC_TENANT_ID ||
    "00000000-0000-0000-0000-000000000001";
  const withGuest = Boolean(cfg.withGuest);

  async function readSessionCookies() {
    const jar = await cookies();
    return {
      access: jar.get(n.access)?.value || "",
      refresh: jar.get(n.refresh)?.value || "",
      guest: jar.get(n.guest)?.value || "",
    };
  }

  function applyAuthCookies(
    res: NextResponse,
    tokens: { access_token?: string; refresh_token?: string } | null
  ) {
    if (tokens?.access_token) {
      res.cookies.set(n.access, tokens.access_token, cookieBase(60 * 15));
      res.cookies.set(n.flag, "1", flagOptions());
      const role = decodeRole(tokens.access_token);
      if (role) res.cookies.set(n.role, role, flagOptions());
    }
    if (tokens?.refresh_token) {
      res.cookies.set(n.refresh, tokens.refresh_token, cookieBase(60 * 60 * 24 * 30));
    }
  }

  function clearAuthCookies(res: NextResponse) {
    for (const name of [n.access, n.refresh, n.flag, n.role]) {
      res.cookies.set(name, "", { ...cookieBase(0), maxAge: 0 });
    }
  }

  async function refreshTokens(refresh: string) {
    try {
      const res = await fetch(`${API_BASE}/v1/auth/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Tenant-ID": TENANT,
        },
        body: JSON.stringify({ refresh_token: refresh }),
        cache: "no-store",
      });
      if (!res.ok) return null;
      const data = (await res.json()) as {
        tokens?: { access_token?: string; refresh_token?: string };
        access_token?: string;
      };
      return {
        access_token: data.tokens?.access_token || data.access_token,
        refresh_token: data.tokens?.refresh_token,
      };
    } catch {
      return null;
    }
  }

  function filterUpstreamHeaders(src: Headers): Headers {
    const out = new Headers();
    const allow = ["content-type", "cache-control", "x-request-id", "x-correlation-id"];
    src.forEach((value: string, key: string) => {
      if (allow.includes(key.toLowerCase())) out.set(key, value);
    });
    return out;
  }

  /** Reject cross-site mutating calls that would ride httpOnly cookies (defense in depth with SameSite=Lax). */
  function csrfReject(req: NextRequest): NextResponse | null {
    const method = req.method.toUpperCase();
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") return null;

    const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
    const site = (req.headers.get("sec-fetch-site") || "").toLowerCase();
    if (site === "cross-site") {
      return NextResponse.json({ error: "csrf_rejected" }, { status: 403 });
    }

    const allowedHosts = new Set<string>();
    if (host) allowedHosts.add(host.toLowerCase());
    for (const raw of (process.env.APP_ORIGIN || process.env.NEXT_PUBLIC_APP_URL || "").split(",")) {
      const v = raw.trim();
      if (!v) continue;
      try {
        allowedHosts.add(new URL(v).host.toLowerCase());
      } catch {
        /* ignore */
      }
    }

    const origin = req.headers.get("origin");
    if (origin) {
      try {
        if (allowedHosts.has(new URL(origin).host.toLowerCase())) return null;
      } catch {
        /* fall through */
      }
      return NextResponse.json({ error: "csrf_rejected" }, { status: 403 });
    }

    const referer = req.headers.get("referer");
    if (referer) {
      try {
        if (allowedHosts.has(new URL(referer).host.toLowerCase())) return null;
      } catch {
        /* fall through */
      }
      return NextResponse.json({ error: "csrf_rejected" }, { status: 403 });
    }

    // No Origin/Referer: browsers normally send one; reject in production.
    if (isProd() && site !== "same-origin" && site !== "same-site" && site !== "none") {
      return NextResponse.json({ error: "csrf_rejected" }, { status: 403 });
    }
    return null;
  }

  async function proxyToBackend(req: NextRequest, pathSegments: string[]) {
    const blocked = csrfReject(req);
    if (blocked) return blocked;

    const path = "/v1/" + pathSegments.map(encodeURIComponent).join("/").replace(/%2F/gi, "/");
    const url = new URL(path + req.nextUrl.search, API_BASE);

    const session = await readSessionCookies();
    const outbound = new Headers();
    req.headers.forEach((value: string, key: string) => {
      const lower = key.toLowerCase();
      if (BLOCKED.has(lower)) return;
      if (lower.startsWith("x-forwarded-")) return;
      outbound.set(key, value);
    });

    outbound.set("X-Tenant-ID", TENANT);
    outbound.delete("Authorization");
    outbound.delete("X-Internal-Key");

    if (session.access) {
      outbound.set("Authorization", `Bearer ${session.access}`);
    }

    let guest = "";
    if (withGuest) {
      guest = session.guest;
      if (!guest || !UUID_RE.test(guest)) guest = crypto.randomUUID();
      outbound.set("X-Guest-ID", guest);
    }

    const init: RequestInit = {
      method: req.method,
      headers: outbound,
      cache: "no-store",
      redirect: "manual",
    };
    let bodyBuf: ArrayBuffer | undefined;
    if (req.method !== "GET" && req.method !== "HEAD") {
      bodyBuf = await req.arrayBuffer();
      init.body = bodyBuf;
    }

    let upstream = await fetch(url, init);
    let authTokens: { access_token?: string; refresh_token?: string } | null = null;

    if (
      upstream.status === 401 &&
      session.refresh &&
      !path.includes("/auth/login") &&
      !path.includes("/auth/refresh") &&
      !path.includes("/auth/register")
    ) {
      const refreshed = await refreshTokens(session.refresh);
      if (refreshed?.access_token) {
        authTokens = refreshed;
        outbound.set("Authorization", `Bearer ${refreshed.access_token}`);
        upstream = await fetch(url, {
          method: req.method,
          headers: outbound,
          cache: "no-store",
          redirect: "manual",
          body: bodyBuf,
        });
      }
    }

    const rawBody = await upstream.arrayBuffer();
    let outBody: BodyInit = rawBody;

    if (upstream.ok && path.includes("/auth/")) {
      try {
        const json = JSON.parse(new TextDecoder().decode(rawBody)) as Record<string, unknown>;
        const nested = json.tokens as { access_token?: string; refresh_token?: string } | undefined;
        const tokens = nested || {
          access_token: typeof json.access_token === "string" ? json.access_token : undefined,
          refresh_token: typeof json.refresh_token === "string" ? json.refresh_token : undefined,
        };
        if (tokens.access_token) {
          authTokens = tokens;
          const safe = { ...json };
          delete safe.tokens;
          delete safe.access_token;
          delete safe.refresh_token;
          outBody = JSON.stringify(safe);
        }
      } catch {
        /* non-JSON */
      }
    }

    const res = new NextResponse(outBody, {
      status: upstream.status,
      headers: filterUpstreamHeaders(upstream.headers),
    });
    if (typeof outBody === "string") {
      res.headers.set("content-type", "application/json");
    }

    if (withGuest && guest && (!session.guest || session.guest !== guest)) {
      res.cookies.set(n.guest, guest, cookieBase(60 * 60 * 24 * 365));
    }
    if (authTokens?.access_token) {
      applyAuthCookies(res, authTokens);
    }
    if (path.includes("/auth/logout") && upstream.ok) {
      clearAuthCookies(res);
    }

    return res;
  }

  /** UI probe — no tokens exposed. Optionally refreshes and returns role from /auth/me. */
  async function sessionProbe(): Promise<NextResponse> {
    const session = await readSessionCookies();
    if (!session.access && !session.refresh) {
      return NextResponse.json({ authenticated: false, role: null });
    }

    let access = session.access;
    let refreshed: { access_token?: string; refresh_token?: string } | null = null;
    if (!access && session.refresh) {
      refreshed = await refreshTokens(session.refresh);
      access = refreshed?.access_token || "";
    }

    if (!access) {
      const res = NextResponse.json({ authenticated: false, role: null });
      clearAuthCookies(res);
      return res;
    }

    try {
      const me = await fetch(`${API_BASE}/v1/auth/me`, {
        headers: {
          Authorization: `Bearer ${access}`,
          "X-Tenant-ID": TENANT,
        },
        cache: "no-store",
      });
      if (!me.ok && session.refresh) {
        refreshed = await refreshTokens(session.refresh);
        if (refreshed?.access_token) {
          access = refreshed.access_token;
          const retry = await fetch(`${API_BASE}/v1/auth/me`, {
            headers: {
              Authorization: `Bearer ${access}`,
              "X-Tenant-ID": TENANT,
            },
            cache: "no-store",
          });
          if (!retry.ok) {
            const res = NextResponse.json({ authenticated: false, role: null });
            clearAuthCookies(res);
            return res;
          }
          const user = (await retry.json()) as { role?: string; id?: string; email?: string };
          const res = NextResponse.json({
            authenticated: true,
            role: user.role || null,
            user: { id: user.id, email: user.email, role: user.role },
          });
          applyAuthCookies(res, refreshed);
          return res;
        }
        const res = NextResponse.json({ authenticated: false, role: null });
        clearAuthCookies(res);
        return res;
      }
      if (!me.ok) {
        const res = NextResponse.json({ authenticated: false, role: null });
        clearAuthCookies(res);
        return res;
      }
      const user = (await me.json()) as { role?: string; id?: string; email?: string };
      const res = NextResponse.json({
        authenticated: true,
        role: user.role || null,
        user: { id: user.id, email: user.email, role: user.role },
      });
      if (refreshed?.access_token) applyAuthCookies(res, refreshed);
      else {
        res.cookies.set(n.flag, "1", flagOptions());
        if (user.role) res.cookies.set(n.role, user.role, flagOptions());
      }
      return res;
    } catch {
      return NextResponse.json({ authenticated: false, role: null });
    }
  }

  async function sessionLogout(): Promise<NextResponse> {
    // CSRF for cookie-clearing logout
    // (called only via same-origin fetch from our UI)
    const session = await readSessionCookies();
    if (session.refresh) {
      try {
        await fetch(`${API_BASE}/v1/auth/logout`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Tenant-ID": TENANT,
          },
          body: JSON.stringify({ refresh_token: session.refresh }),
          cache: "no-store",
        });
      } catch {
        /* best-effort */
      }
    }
    const res = NextResponse.json({ ok: true });
    clearAuthCookies(res);
    return res;
  }

  return {
    cookieNames: n,
    proxyToBackend,
    sessionProbe,
    sessionLogout,
    clearAuthCookies,
    applyAuthCookies,
    readSessionCookies,
    csrfReject,
  };
}

export type SessionHandlers = ReturnType<typeof createSession>;
