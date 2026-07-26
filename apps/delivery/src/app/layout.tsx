import "./globals.css";
import "@gayrat/map/styles.css";
import { Providers } from "@/components/Providers";

export const metadata = {
  title: "Gayrat Courier",
  description: "Courier delivery panel",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className="font-sans text-night antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
