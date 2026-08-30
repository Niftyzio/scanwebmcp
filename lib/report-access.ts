import { createHmac, timingSafeEqual } from "node:crypto";

export const REPORT_ACCESS_COOKIE = "agent-surface-report-access";
export const REPORT_ACCESS_MAX_AGE = 60 * 60 * 24 * 30;

type ReportAccessPayload = {
  v: 1;
  slug: string;
  exp: number;
};

function accessSecret(): string {
  const secret = process.env.REPORT_ACCESS_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV !== "production") return "local-agent-surface-report-access";
  throw new Error("REPORT_ACCESS_SECRET is required in production");
}

function signature(payload: string): string {
  return createHmac("sha256", accessSecret()).update(payload).digest("base64url");
}

export function createReportAccessToken(
  slug: string,
  now = Date.now(),
  maxAgeSeconds = REPORT_ACCESS_MAX_AGE,
): string {
  const payload: ReportAccessPayload = {
    v: 1,
    slug,
    exp: Math.floor(now / 1000) + maxAgeSeconds,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signature(encoded)}`;
}

export function readReportAccessToken(token: string | undefined, now = Date.now()): ReportAccessPayload | null {
  if (!token || token.length > 2048) return null;
  const [encoded, supplied, extra] = token.split(".");
  if (!encoded || !supplied || extra) return null;

  const expected = signature(encoded);
  const suppliedBytes = Buffer.from(supplied);
  const expectedBytes = Buffer.from(expected);
  if (suppliedBytes.length !== expectedBytes.length || !timingSafeEqual(suppliedBytes, expectedBytes)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Partial<ReportAccessPayload>;
    if (
      payload.v !== 1 ||
      typeof payload.slug !== "string" ||
      !/^[a-z0-9.-]+$/.test(payload.slug) ||
      typeof payload.exp !== "number" ||
      payload.exp <= Math.floor(now / 1000)
    ) {
      return null;
    }
    return payload as ReportAccessPayload;
  } catch {
    return null;
  }
}

export function hasReportAccess(token: string | undefined, slug: string, now = Date.now()): boolean {
  return readReportAccessToken(token, now)?.slug === slug;
}

export function reportAccessCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: REPORT_ACCESS_MAX_AGE,
  };
}
