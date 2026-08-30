import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { captureReportLead, LeadError } from "@/lib/leads";

export const maxDuration = 15;

export async function POST(request: Request) {
  let body: { email?: string; slug?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send JSON: { email, slug }" }, { status: 400 });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ipHash = ip
    ? createHash("sha256")
        .update(`${process.env.SCAN_RATE_SALT ?? "agent-surface-scan-v0"}:${ip}`)
        .digest("hex")
        .slice(0, 32)
    : null;

  try {
    await captureReportLead({ email: body.email ?? "", slug: body.slug ?? "", ipHash });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof LeadError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Could not save that — try again." }, { status: 500 });
  }
}
