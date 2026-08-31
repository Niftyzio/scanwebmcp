import { NextResponse } from "next/server";
import { requestScan } from "@/lib/scan-service";
import { requesterHash } from "@/lib/request-identity";
import { apiError } from "@/lib/api-error";

export const maxDuration = 60;

export async function POST(request: Request) {
  let body: { url?: string; rescan?: boolean; requester?: string; sector?: string };
  try {
    body = await request.json();
  } catch {
    return apiError(
      "INVALID_JSON",
      "The request body is not valid JSON.",
      'Send Content-Type: application/json with a body such as {"url":"example.com"}.',
      400,
    );
  }
  if (!body.url) {
    return apiError(
      "MISSING_URL",
      "The url field is required.",
      'Send a public HTTP(S) URL or domain in the url field, for example {"url":"example.com"}.',
      400,
    );
  }

  const requesterType = body.requester === "agent" ? "agent" : "human";
  try {
    const result = await requestScan({
      url: body.url,
      trigger: body.rescan ? "rescan" : requesterType === "agent" ? "agent" : "user",
      requesterType,
      userAgent: request.headers.get("user-agent") ?? undefined,
      sector: body.sector,
      ipHash: requesterHash(request),
    });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Scan failed";
    const status = /^Rate limit/.test(message)
      ? 429
      : /valid URL|Private|opted out|http/.test(message)
        ? 400
        : 500;
    if (status === 429) {
      return apiError(
        "RATE_LIMITED",
        message,
        "Reuse the result URL from an earlier response or retry after the hourly limit resets.",
        status,
        { "Retry-After": "3600" },
      );
    }
    if (status === 400) {
      return apiError(
        "INVALID_TARGET",
        message,
        "Use a public HTTP(S) website that permits scanning and does not resolve to a private or reserved address.",
        status,
      );
    }
    return apiError(
      "SCAN_FAILED",
      message,
      "Retry later. If the failure persists, send the target domain and timestamp through the contact page.",
      status,
    );
  }
}
