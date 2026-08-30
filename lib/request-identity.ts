import { createHash } from "node:crypto";

/** Stable, privacy-preserving requester key for shared serverless rate limits.
 * Raw network addresses are never retained. */
export function requesterHash(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip")?.trim();
  const fallback = `unknown:${request.headers.get("user-agent") ?? "no-user-agent"}`;
  const salt = process.env.SCAN_RATE_SALT ?? "agent-surface-scan-local-development";
  return createHash("sha256").update(`${salt}:${ip || fallback}`).digest("hex").slice(0, 32);
}
