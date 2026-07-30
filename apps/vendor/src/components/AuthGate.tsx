"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { clearTokens, isVendorRole, probeSessionSafe } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useI18n();
  const [ready, setReady] = useState(pathname === "/");
  const [ok, setOk] = useState(false);
  const [denied, setDenied] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const session = await probeSessionSafe();
      if (cancelled) return;
      if (!session.authenticated) {
        setOk(false);
        setDenied("");
        if (pathname !== "/") router.replace("/");
        setReady(true);
        return;
      }
      if (!isVendorRole(session.role)) {
        await clearTokens();
        setOk(false);
        setDenied(t("authNoAccess"));
        if (pathname !== "/") router.replace("/");
        setReady(true);
        return;
      }
      setDenied("");
      setOk(true);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname, router, t]);

  if (pathname === "/") {
    return (
      <>
        {denied ? (
          <p className="fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-full bg-rose-600 px-4 py-2 text-sm text-white shadow-lg">
            {denied}
          </p>
        ) : null}
        {children}
      </>
    );
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
        {t("authLoading")}
      </div>
    );
  }

  if (!ok) return null;
  return <>{children}</>;
}
