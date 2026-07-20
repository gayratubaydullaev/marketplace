import "./globals.css";
import { Providers } from "@/components/Providers";

export const metadata = {
  title: "Gayrat Vendor",
  description: "Seller console",
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
