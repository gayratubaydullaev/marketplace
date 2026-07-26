import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** Gateway URL for SSR + rewrites. Browser calls same-origin `/v1/*` (see api.ts). */
const API_BASE = (process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8080").replace(/\/$/, "");

const nextConfig: NextConfig = {
  transpilePackages: ["@gayrat/i18n", "@gayrat/map"],
  eslint: {
    // ESLint is run via `pnpm lint`; don't hard-fail production builds when the
    // eslint package isn't installed in this workspace.
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [{ protocol: "http", hostname: "localhost" }],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
          {
            key: "Content-Security-Policy",
            value: "frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
          },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/v1/:path*",
        destination: `${API_BASE}/v1/:path*`,
      },
    ];
  },
};

export default withNextIntl(nextConfig);
