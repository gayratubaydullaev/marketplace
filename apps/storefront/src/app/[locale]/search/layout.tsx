import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Search — Gayrat Market",
  description: "Search products on Gayrat marketplace",
  robots: { index: true, follow: true },
};

export default function SearchLayout({ children }: { children: React.ReactNode }) {
  return children;
}
