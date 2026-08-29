import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { sendReportEmail } from "@/lib/email";

export const maxDuration = 15;

const RUNG_PLAIN = [
  "AI agents can't see this site yet",
  "AI agents can read this site — and not much more",
  "AI agents can answer buyers' questions about this business",
  "AI agents can act on this site, not just read it",
  "AI agents can complete real actions here, end to end",
];

export async function POST(request: Request) {
  let body: { email?: string; slug?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send JSON: { email, slug }" }, { status: 400 });
  }
  const email = body.email?.trim().toLowerCase() ?? "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254)
    return NextResponse.json({ error: "That email doesn't look right." }, { status: 400 });
  if (!body.slug) return NextResponse.json({ error: "slug is required" }, { status: 400 });

  const supabase = db();
  const { data: scan } = await supabase
    .from("scans")
    .select("id, slug, composite, rung, sites!inner(domain)")
    .eq("slug", body.slug)
    .eq("status", "complete")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!scan) return NextResponse.json({ error: "No completed scan found for that page." }, { status: 404 });
  const domain = (scan as unknown as { sites: { domain: string } }).sites.domain;

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ipHash = ip
    ? createHash("sha256")
        .update(`${process.env.SCAN_RATE_SALT ?? "agent-surface-scan-v0"}:${ip}`)
        .digest("hex")
        .slice(0, 32)
    : null;
  if (ipHash) {
    const { count } = await supabase
      .from("leads")
      .select("*", { count: "exact", head: true })
      .eq("ip_hash", ipHash)
      .gte("created_at", new Date(Date.now() - 3600_000).toISOString());
    if ((count ?? 0) >= 5)
      return NextResponse.json({ error: "Rate limit: try again in a little while." }, { status: 429 });
  }

  const sendResult = await sendReportEmail({
    to: email,
    domain,
    slug: scan.slug,
    composite: scan.composite,
    verdict: RUNG_PLAIN[scan.rung ?? 0],
  });

  const { error: insertErr } = await supabase.from("leads").upsert(
    {
      email,
      domain,
      scan_id: scan.id,
      ip_hash: ipHash,
      report_sent: sendResult.sent,
    },
    { onConflict: "email,domain" },
  );
  if (insertErr)
    return NextResponse.json({ error: "Could not save that — try again." }, { status: 500 });

  // Capture always succeeds; whether the mail went now or queued is ours to manage.
  return NextResponse.json({ ok: true });
}
