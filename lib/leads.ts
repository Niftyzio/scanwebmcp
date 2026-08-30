/**
 * Lead capture — the one place an email enters the system. Shared by the
 * report-email API route (human form), the page's WebMCP email_report tool,
 * and the MCP server's email_report tool, so every surface gets the same
 * validation, rate limits, and storage.
 */
import { db } from "./db";
import { sendReportEmail } from "./email";

const RUNG_PLAIN = [
  "AI agents can't see this site yet",
  "AI agents can read this site — and not much more",
  "AI agents can answer buyers' questions about this business",
  "AI agents can act on this site, not just read it",
  "AI agents can complete real actions here, end to end",
];

class LeadError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export { LeadError };

export async function captureReportLead(opts: {
  email: string;
  slug: string;
  ipHash?: string | null;
}): Promise<{ domain: string }> {
  const email = opts.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254)
    throw new LeadError("That email doesn't look right.", 400);
  if (!opts.slug) throw new LeadError("slug is required", 400);

  const supabase = db();
  const { data: scan } = await supabase
    .from("scans")
    .select("id, slug, composite, rung, sites!inner(domain)")
    .eq("slug", opts.slug)
    .eq("status", "complete")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!scan) throw new LeadError("No completed scan found for that page.", 404);
  const domain = (scan as unknown as { sites: { domain: string } }).sites.domain;

  if (opts.ipHash) {
    const { count } = await supabase
      .from("leads")
      .select("*", { count: "exact", head: true })
      .eq("ip_hash", opts.ipHash)
      .gte("created_at", new Date(Date.now() - 3600_000).toISOString());
    if ((count ?? 0) >= 5) throw new LeadError("Rate limit: try again in a little while.", 429);
  }

  const sendResult = await sendReportEmail({
    to: email,
    domain,
    slug: scan.slug,
    composite: scan.composite,
    verdict: RUNG_PLAIN[scan.rung ?? 0],
  });

  if (!sendResult.sent) console.error(`report-email send failed: ${sendResult.error}`);
  const { error: insertErr } = await supabase.from("leads").upsert(
    {
      email,
      domain,
      scan_id: scan.id,
      ip_hash: opts.ipHash ?? null,
      report_sent: sendResult.sent,
      send_error: sendResult.sent ? null : (sendResult.error ?? "unknown"),
    },
    { onConflict: "email,domain" },
  );
  if (insertErr) throw new LeadError("Could not save that — try again.", 500);

  // Capture always succeeds; whether the mail went now or queued is ours to manage.
  return { domain };
}
