export const SITE_NAME = "ScanWebMCP.com";

const FALLBACK_SITE_ORIGIN = "https://www.scanwebmcp.com";
const LEGACY_SITE_ORIGIN = "https://scanwebmcp.vercel.app";

function configuredSiteOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  if (!configured) return FALLBACK_SITE_ORIGIN;

  try {
    const url = new URL(configured);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
      return FALLBACK_SITE_ORIGIN;
    }
    if (url.origin === LEGACY_SITE_ORIGIN) return FALLBACK_SITE_ORIGIN;
    return url.origin;
  } catch {
    return FALLBACK_SITE_ORIGIN;
  }
}

export const SITE_ORIGIN = configuredSiteOrigin();

export function siteUrl(path = "/"): string {
  const internalPath = `/${path.replace(/^\/+/, "")}`;
  return new URL(internalPath, `${SITE_ORIGIN}/`).toString();
}
