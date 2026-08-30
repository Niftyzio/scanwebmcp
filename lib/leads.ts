/** Shared report capture, delivery state, retry, and marketing consent. */
import { createHash, randomBytes } from "node:crypto";
import { db } from "./db";
import { sendMarketingConfirmationEmail, sendReportEmail } from "./email";

const RUNG_PLAIN = [
  "AI agents can't see this site yet",
  "AI agents can read this site — and not much more",
  "AI agents can answer buyers' questions about this business",
  "AI agents can act on this site, not just read it",
  "AI agents can complete real actions here, end to end",
];

class LeadError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}
export { LeadError };

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
const newToken = () => randomBytes(32).toString("base64url");

export async function captureReportLead(opts: {
  email: string;
  slug: string;
  ipHash?: string | null;
  marketingConsent?: boolean;
}): Promise<{ domain: string; delivery: "sent" | "queued" }> {
  const email = opts.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254)
    throw new LeadError("That email doesn't look right.", 400);
  if (!opts.slug) throw new LeadError("slug is required", 400);

  const supabase = db();
  const { data: scan, error: scanError } = await supabase
    .from("scans")
    .select("id, slug, composite, rung, sites!inner(domain)")
    .eq("slug", opts.slug)
    .eq("status", "complete")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (scanError) throw new LeadError("Could not load that report — try again.", 500);
  if (!scan) throw new LeadError("No completed scan found for that page.", 404);
  const domain = (scan as unknown as { sites: { domain: string } }).sites.domain;

  if (opts.ipHash) {
    const { data: allowed, error } = await supabase.rpc("consume_rate_limit", {
      requested_kind: "report_email",
      requested_hash: opts.ipHash,
      maximum_events: 5,
      window_seconds: 3600,
    });
    if (error) throw new LeadError("Could not check the rate limit — try again.", 500);
    if (!allowed) throw new LeadError("Rate limit: try again in a little while.", 429);
  }

  const { data: existing, error: existingError } = await supabase
    .from("leads")
    .select("id, report_sent, marketing_consent, marketing_confirmed_at")
    .eq("email", email)
    .eq("domain", domain)
    .maybeSingle();
  if (existingError) throw new LeadError("Could not save that — try again.", 500);

  const confirmationToken = opts.marketingConsent && !existing?.marketing_confirmed_at ? newToken() : undefined;
  const requestedMarketing = Boolean(existing?.marketing_consent || opts.marketingConsent);
  const { data: lead, error: upsertError } = await supabase
    .from("leads")
    .upsert(
      {
        email,
        domain,
        scan_id: scan.id,
        ip_hash: opts.ipHash ?? null,
        report_sent: existing?.report_sent ?? false,
        marketing_consent: requestedMarketing,
        consent_requested_at: opts.marketingConsent ? new Date().toISOString() : null,
        confirmation_token_hash: confirmationToken ? tokenHash(confirmationToken) : undefined,
      },
      { onConflict: "email,domain" },
    )
    .select("id, report_sent, report_delivery_key, delivery_attempts")
    .single();
  if (upsertError || !lead) throw new LeadError("Could not save that — try again.", 500);

  if (lead.report_sent) {
    if (confirmationToken) {
      const confirmation = await sendMarketingConfirmationEmail({
        to: email,
        domain,
        token: confirmationToken,
        deliveryKey: lead.report_delivery_key,
      });
      if (!confirmation.sent)
        throw new LeadError("The report is already delivered, but the updates confirmation could not be sent. Try again later.", 503);
    }
    return { domain, delivery: "sent" };
  }

  const sendResult = await sendReportEmail({
    to: email,
    domain,
    slug: scan.slug,
    composite: scan.composite,
    verdict: RUNG_PLAIN[scan.rung ?? 0],
    deliveryKey: lead.report_delivery_key,
    marketingConfirmationToken: confirmationToken,
  });
  const { error: deliveryError } = await supabase
    .from("leads")
    .update({
      report_sent: sendResult.sent,
      send_error: sendResult.sent ? null : (sendResult.error ?? "unknown"),
      delivery_attempts: (lead.delivery_attempts ?? 0) + 1,
      last_delivery_attempt_at: new Date().toISOString(),
    })
    .eq("id", lead.id);
  if (deliveryError) throw new LeadError("The report delivery state could not be saved — try again.", 500);

  return { domain, delivery: sendResult.sent ? "sent" : "queued" };
}

/** Retry a small pending batch. Stable provider idempotency keys prevent a
 * successful-but-unrecorded request from creating duplicate mail. */
export async function flushPendingReports(limit = 5): Promise<{ sent: number; pending: number }> {
  const supabase = db();
  const { data: leads, error } = await supabase
    .from("leads")
    .select("id, email, domain, report_delivery_key, delivery_attempts, marketing_consent, marketing_confirmed_at, scans!inner(slug, composite, rung)")
    .eq("report_sent", false)
    .lt("delivery_attempts", 5)
    .order("last_delivery_attempt_at", { ascending: true, nullsFirst: true })
    .limit(Math.min(Math.max(limit, 1), 10));
  if (error) throw new Error(`Could not load pending reports: ${error.message}`);

  let sent = 0;
  for (const lead of leads ?? []) {
    const scan = (lead as unknown as { scans: { slug: string; composite: number | null; rung: number | null } }).scans;
    const confirmationToken = lead.marketing_consent && !lead.marketing_confirmed_at ? newToken() : undefined;
    if (confirmationToken) {
      const { error: tokenError } = await supabase
        .from("leads")
        .update({ confirmation_token_hash: tokenHash(confirmationToken) })
        .eq("id", lead.id);
      if (tokenError) continue;
    }
    const result = await sendReportEmail({
      to: lead.email,
      domain: lead.domain,
      slug: scan.slug,
      composite: scan.composite,
      verdict: RUNG_PLAIN[scan.rung ?? 0],
      deliveryKey: lead.report_delivery_key,
      marketingConfirmationToken: confirmationToken,
    });
    const { error: updateError } = await supabase
      .from("leads")
      .update({
        report_sent: result.sent,
        send_error: result.sent ? null : (result.error ?? "unknown"),
        delivery_attempts: (lead.delivery_attempts ?? 0) + 1,
        last_delivery_attempt_at: new Date().toISOString(),
      })
      .eq("id", lead.id);
    if (!updateError && result.sent) sent++;
  }
  return { sent, pending: (leads ?? []).length - sent };
}

export async function confirmMarketingUpdates(token: string): Promise<boolean> {
  if (!token || token.length > 200) return false;
  const { data, error } = await db()
    .from("leads")
    .update({ marketing_confirmed_at: new Date().toISOString(), confirmation_token_hash: null })
    .eq("confirmation_token_hash", tokenHash(token))
    .eq("marketing_consent", true)
    .is("marketing_confirmed_at", null)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`Could not confirm updates: ${error.message}`);
  return Boolean(data);
}
