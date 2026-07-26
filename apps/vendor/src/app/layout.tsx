import "./globals.css";
import "@gayrat/map/styles.css";
import { Providers } from "@/components/Providers";

export const metadata = {
  title: "Gayrat Vendor",
  description: "Seller console",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // @sentry/nextjs is not installed yet; keep this public DSN available for its client initializer.
  void process.env.NEXT_PUBLIC_SENTRY_DSN;

  return (
    <html lang="ru" suppressHydrationWarning>
      <body className="font-sans text-night antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
