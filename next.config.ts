import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright is the local renderer fallback (lib/render.ts) — never bundle
  // it; it's loaded dynamically and absent in serverless deploys.
  serverExternalPackages: ["playwright", "playwright-core"],
  // Tracing misses playwright-core's runtime data files (browsers.json et al),
  // which crashes the externalized module load in serverless. Force the whole
  // package into every route's bundle that can trigger a scan.
  outputFileTracingIncludes: {
    "/**": ["node_modules/playwright-core/**"],
  },
};

export default nextConfig;
