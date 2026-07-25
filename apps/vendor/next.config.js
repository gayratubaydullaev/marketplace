/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@gayrat/map", "@gayrat/ui"],
  eslint: { ignoreDuringBuilds: true },
};
module.exports = nextConfig;
