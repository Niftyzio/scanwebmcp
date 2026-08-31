import type { NextConfig } from "next";

const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "connect-src 'self' https://vitals.vercel-insights.com",
  "font-src 'self' data:",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "img-src 'self' data: blob:",
  "manifest-src 'self'",
  "media-src 'self'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "worker-src 'self' blob:",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  turbopack: { root: process.cwd() },
  async headers() {
    return [
      {
        source: "/",
        headers: [{
          key: "Link",
          value: '</sitemap.xml>; rel="sitemap"; type="application/xml", </index.md>; rel="alternate"; type="text/markdown", </openapi.json>; rel="service-desc"; type="application/vnd.oai.openapi+json;version=3.1", </.well-known/api-catalog>; rel="api-catalog", </.well-known/ard.json>; rel="ard"',
        }],
      },
      {
        source: "/developers",
        headers: [{
          key: "Link",
          value: '</developers/llms.txt>; rel="alternate"; type="text/plain", </openapi.json>; rel="service-desc"; type="application/vnd.oai.openapi+json;version=3.1"',
        }],
      },
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
          { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(), payment=(), usb=()" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
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
