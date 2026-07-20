import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
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
