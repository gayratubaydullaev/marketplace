"use client";

import { AuthGate } from "@/components/AuthGate";
import { CourierShell } from "@/components/CourierShell";
import { LocaleProvider } from "@/lib/i18n";
import { deliveryMessages } from "@/messages";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <LocaleProvider messages={deliveryMessages}>
      <AuthGate>
        <CourierShell>{children}</CourierShell>
      </AuthGate>
    </LocaleProvider>
  );
}
