import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  transpilePackages: ["@gayrat/i18n", "@gayrat/map", "@gayrat/web-session"],
  eslint: {
    // ESLint is run via `pnpm lint`; don't hard-fail production builds when the
    // eslint package isn't installed in this workspace.
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "localhost", pathname: "/**" },
      { protocol: "http", hostname: "127.0.0.1", pathname: "/**" },
      { protocol: "https", hostname: "gayrat.uz", pathname: "/**" },
      { protocol: "https", hostname: "www.gayrat.uz", pathname: "/**" },
      { protocol: "https", hostname: "cdn.gayrat.uz", pathname: "/**" },
      { protocol: "https", hostname: "media.gayrat.uz", pathname: "/**" },
    ],
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
            value:
              "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'; " +
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; " +
              "img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https: http://localhost:* http://127.0.0.1:* ws: wss:; " +
              "worker-src 'self' blob:",
          },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      // Legacy same-origin `/v1/*` → BFF (httpOnly cookies), not the bare gateway.
      {
        source: "/v1/:path*",
        destination: "/api/gateway/:path*",
      },
    ];
  },
};

export default withNextIntl(nextConfig);
