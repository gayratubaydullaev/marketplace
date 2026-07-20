import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  transpilePackages: ["@gayrat/i18n"],
  images: {
    remotePatterns: [{ protocol: "http", hostname: "localhost" }],
  },
};

export default withNextIntl(nextConfig);
