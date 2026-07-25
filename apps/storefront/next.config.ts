import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

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
};

export default withNextIntl(nextConfig);
