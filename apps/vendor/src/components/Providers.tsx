"use client";

import { AuthGate } from "@/components/AuthGate";
import { VendorShell } from "@/components/VendorShell";
import { LocaleProvider } from "@/lib/i18n";
import { vendorMessages } from "@/messages";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <LocaleProvider messages={vendorMessages}>
      <AuthGate>
        <VendorShell>{children}</VendorShell>
      </AuthGate>
    </LocaleProvider>
  );
}
