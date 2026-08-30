/**
 * Email delivery behind an interface, same principle as the renderer: the
 * capture always works; sending needs a provider. With RESEND_API_KEY set,
 * reports go out immediately; without it they queue in `leads`
 * (report_sent=false) and a later flush picks them up. Never fatal.
 */
import { createReportAccessToken } from "./report-access";

export interface ReportEmail {
  to: string;
  domain: string;
  slug: string;
  composite: number | null;
  verdict: string;
  deliveryKey: string;
  marketingConfirmationToken?: string;
}

const FROM = process.env.EMAIL_FROM ?? "Agent Surface Scan <scan@nocodelab.ai>";
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "https://scanwebmcp.vercel.app";

export async function sendReportEmail(r: ReportEmail): Promise<{ sent: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, error: "no_provider_configured" };

  const accessToken = createReportAccessToken(r.slug);
  const url = `${BASE_URL}/api/report-access?token=${encodeURIComponent(accessToken)}`;
  const confirmationUrl = r.marketingConfirmationToken
    ? `${BASE_URL}/api/confirm-updates?token=${encodeURIComponent(r.marketingConfirmationToken)}`
    : null;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        "Idempotency-Key": `report-${r.deliveryKey}`,
      },
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
          ...(confirmationUrl
            ? [
                `You also asked for occasional benchmark updates. Confirm that separately here:`,
                confirmationUrl,
                `No updates will be sent unless you confirm.`,
                ``,
              ]
            : []),
          `— Agent Surface Scan, by Agentic Sara`,
        ].join("\n"),
      }),
    });
    if (!res.ok) return { sent: false, error: `resend_http_${res.status}` };
    return { sent: true };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function sendMarketingConfirmationEmail(opts: {
  to: string;
  domain: string;
  token: string;
  deliveryKey: string;
}): Promise<{ sent: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { sent: false, error: "no_provider_configured" };
  const url = `${BASE_URL}/api/confirm-updates?token=${encodeURIComponent(opts.token)}`;
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        "Idempotency-Key": `confirm-${opts.deliveryKey}-${opts.token.slice(0, 12)}`,
      },
      body: JSON.stringify({
        from: FROM,
        to: [opts.to],
        subject: `Confirm benchmark updates for ${opts.domain}`,
        text: `Confirm occasional Agent Surface Scan benchmark updates for ${opts.domain}:\n\n${url}\n\nNo updates will be sent unless you confirm.`,
      }),
    });
    return response.ok ? { sent: true } : { sent: false, error: `resend_http_${response.status}` };
  } catch (error) {
    return { sent: false, error: error instanceof Error ? error.message : String(error) };
  }
}
