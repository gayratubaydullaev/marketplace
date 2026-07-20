"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { clearTokens, getToken, tokenHasAdminRole } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useI18n();
  const [ready, setReady] = useState(pathname === "/");
  const [denied, setDenied] = useState("");

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setDenied("");
      if (pathname !== "/") router.replace("/");
      setReady(true);
      return;
    }
    if (!tokenHasAdminRole(token)) {
      clearTokens();
      setDenied(t("authNoAccess"));
      if (pathname !== "/") router.replace("/");
      setReady(true);
      return;
    }
    setDenied("");
    setReady(true);
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

  if (!tokenHasAdminRole(getToken())) {
    return null;
  }

  return <>{children}</>;
}
