import type { Metadata, Viewport } from "next";
import "./globals.css";
import "@gayrat/map/styles.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  icons: {
    icon: [{ url: "/favicon.ico", sizes: "any" }],
    shortcut: "/favicon.ico",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0d7377",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uz" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
