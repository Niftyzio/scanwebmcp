import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright is the local renderer fallback (lib/render.ts) — never bundle
  // it; it's loaded dynamically and absent in serverless deploys.
  serverExternalPackages: ["playwright"],
};

export default nextConfig;
