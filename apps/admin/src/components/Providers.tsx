"use client";

import { AuthGate } from "@/components/AuthGate";
import { AdminShell } from "@/components/AdminShell";
import { LocaleProvider } from "@/lib/i18n";
import { adminMessages } from "@/messages";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <LocaleProvider messages={adminMessages}>
      <AuthGate>
        <AdminShell>{children}</AdminShell>
      </AuthGate>
    </LocaleProvider>
  );
}
