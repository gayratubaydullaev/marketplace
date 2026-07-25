"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { api, getToken, tokenHasCourierRole } from "@/lib/api";
import { LocaleSwitcher, useI18n } from "@/lib/i18n";
import { SHIFT_EVENT, emitShiftChange } from "@/lib/status";

const NAV = [
  {
    href: "/jobs",
    key: "navJobs",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
        <rect x="9" y="3" width="6" height="4" rx="1" />
        <path d="M9 12h6M9 16h4" />
      </svg>
    ),
  },
  {
    href: "/route",
    key: "navRoute",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="6" cy="19" r="2" />
        <circle cx="18" cy="5" r="2" />
        <path d="M8 19h6a4 4 0 0 0 4-4V7" />
      </svg>
    ),
  },
  {
    href: "/earnings",
    key: "navEarnings",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 3v18M7 8h8a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h8" />
      </svg>
    ),
  },
  {
    href: "/profile",
    key: "navProfile",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 19c1.5-3 4-4.5 7-4.5s5.5 1.5 7 4.5" />
      </svg>
    ),
  },
] as const;

export function CourierShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { t } = useI18n();
  const [authed, setAuthed] = useState(false);
  const [onShift, setOnShift] = useState(false);
  const [shiftBusy, setShiftBusy] = useState(false);
  const [gpsOk, setGpsOk] = useState<boolean | null>(null);
  const [activeJobs, setActiveJobs] = useState(0);
  const [courierName, setCourierName] = useState("");

  const refreshShift = useCallback(() => {
    api<{
      shift?: { status?: string } | null;
      courier?: { full_name?: string; active_jobs?: number };
    }>("/v1/courier/me")
      .then((d) => {
        const open = !!d.shift && d.shift.status === "open";
        setOnShift(open);
        setActiveJobs(d.courier?.active_jobs || 0);
        setCourierName((d.courier?.full_name || "").split(/\s+/)[0] || "");
      })
      .catch(() => setOnShift(false));
  }, []);

  useEffect(() => {
    setAuthed(tokenHasCourierRole(getToken()));
  }, [pathname]);

  useEffect(() => {
    if (!authed || pathname === "/") return;
    refreshShift();

    const onShiftEvt = (e: Event) => {
      const detail = (e as CustomEvent<{ onShift?: boolean }>).detail;
      if (typeof detail?.onShift === "boolean") setOnShift(detail.onShift);
      refreshShift();
    };
    window.addEventListener(SHIFT_EVENT, onShiftEvt);
    return () => window.removeEventListener(SHIFT_EVENT, onShiftEvt);
  }, [authed, pathname, refreshShift]);

  // Push GPS only while on shift (admin fleet + live track depend on last_lat/lng).
  useEffect(() => {
    if (!authed || pathname === "/" || !onShift) {
      if (!onShift) setGpsOk(null);
      return;
    }
    if (!navigator.geolocation) {
      setGpsOk(false);
      return;
    }
    const ping = () => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          api("/v1/courier/location", {
            method: "POST",
            body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          })
            .then(() => setGpsOk(true))
            .catch(() => setGpsOk(false));
        },
        () => setGpsOk(false),
        { enableHighAccuracy: true, maximumAge: 15_000, timeout: 12_000 }
      );
    };
    ping();
    const id = window.setInterval(ping, 25_000);
    return () => window.clearInterval(id);
  }, [authed, pathname, onShift]);

  async function toggleShift() {
    if (shiftBusy) return;
    setShiftBusy(true);
    try {
      if (onShift) await api("/v1/courier/shifts/close", { method: "POST", body: "{}" });
      else await api("/v1/courier/shifts/open", { method: "POST", body: "{}" });
      const next = !onShift;
      setOnShift(next);
      emitShiftChange(next);
    } catch {
      refreshShift();
    } finally {
      setShiftBusy(false);
    }
  }

  if (!authed || pathname === "/") return <>{children}</>;

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col pb-28">
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-slate-200/80 bg-white/90 px-4 py-3 backdrop-blur">
        <div className="min-w-0">
          <p className="font-display text-lg font-bold text-night">{t("brand")}</p>
          <p className="truncate text-[11px] text-slate-500">
            {courierName ? `${courierName} · ` : ""}
            {onShift ? t("shiftOn") : t("shiftOff")}
            {onShift && gpsOk === true ? ` · ${t("gpsShort")}` : onShift && gpsOk === false ? ` · ${t("profileGpsOff")}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {pathname !== "/profile" ? (
            <button
              type="button"
              disabled={shiftBusy}
              onClick={toggleShift}
              className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide transition ${
                onShift ? "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300" : "bg-slate-100 text-slate-500 ring-1 ring-slate-200"
              }`}
              title={onShift ? t("shiftClose") : t("shiftOpen")}
            >
              {onShift ? t("shiftOn") : t("shiftOff")}
            </button>
          ) : null}
          <LocaleSwitcher />
        </div>
      </header>
      <main className="flex-1 px-4 py-4">{children}</main>
      <nav className="fixed bottom-0 left-0 right-0 z-20 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto flex max-w-lg justify-around px-2 py-2">
          {NAV.map((n) => {
            const active = pathname === n.href || pathname.startsWith(`${n.href}/`);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`relative flex min-w-[3.75rem] flex-col items-center gap-0.5 rounded-xl px-2 py-2 text-[10px] font-semibold transition ${
                  active ? "bg-teal/10 text-teal" : "text-slate-500 hover:text-night"
                }`}
              >
                {n.icon}
                {t(n.key)}
                {n.href === "/jobs" && activeJobs > 0 ? (
                  <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-saffron px-1 text-[9px] font-bold text-night">
                    {activeJobs > 9 ? "9+" : activeJobs}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
