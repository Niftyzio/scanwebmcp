/**
 * Email delivery behind an interface, same principle as the renderer: the
 * capture always works; sending needs a provider. With RESEND_API_KEY set,
 * reports go out immediately; without it they queue in `leads`
 * (report_sent=false) and a later flush picks them up. Never fatal.
 */

export interface ReportEmail {
  to: string;
  domain: string;
  slug: string;
  composite: number | null;
  verdict: string;
}

const FROM = process.env.EMAIL_FROM ?? "Agent Surface Scan <scan@nocodelab.ai>";
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://scanwebmcp.vercel.app";

export async function sendReportEmail(r: ReportEmail): Promise<{ sent: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, error: "no_provider_configured" };

  const url = `${BASE_URL}/scan/${r.slug}`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        from: FROM,
        to: [r.to],
        subject: `Your Agent Surface Scan: ${r.domain}${r.composite != null ? ` — ${r.composite}/100` : ""}`,
        text: [
          `Your scan of ${r.domain} is ready.`,
          ``,
          r.composite != null ? `Agent Surface Score: ${r.composite}/100` : ``,
          `The verdict: ${r.verdict}.`,
          ``,
          `The full report — every finding with its evidence, and where you sit against your industry — stays live here:`,
          url,
          ``,
          `The benchmark is re-drawn as new businesses are scanned, so your position moves when you fix something (and when your competitors get scanned). We'll let you know when it does.`,
          ``,
          `— Agent Surface Scan, by Agentic Sara`,
          `Unsubscribe any time by replying with "unsubscribe".`,
        ].join("\n"),
      }),
    });
    if (!res.ok) return { sent: false, error: `resend_http_${res.status}` };
    return { sent: true };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : String(e) };
  }
}
