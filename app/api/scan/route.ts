import { NextResponse } from "next/server";
import { requestScan } from "@/lib/scan-service";
import { requesterHash } from "@/lib/request-identity";

export const maxDuration = 60;

export async function POST(request: Request) {
  let body: { url?: string; rescan?: boolean; requester?: string; sector?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send JSON: { url }" }, { status: 400 });
  }
  if (!body.url) return NextResponse.json({ error: "url is required" }, { status: 400 });

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
    return NextResponse.json({ error: message }, { status });
  }
}
