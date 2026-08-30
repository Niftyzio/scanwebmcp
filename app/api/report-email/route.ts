import { NextResponse } from "next/server";
import { captureReportLead, LeadError } from "@/lib/leads";
import { requesterHash } from "@/lib/request-identity";
import {
  createReportAccessToken,
  REPORT_ACCESS_COOKIE,
  reportAccessCookieOptions,
} from "@/lib/report-access";

export const maxDuration = 15;

export async function POST(request: Request) {
  let body: { email?: string; slug?: string; marketingConsent?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send JSON: { email, slug }" }, { status: 400 });
  }

  try {
    const result = await captureReportLead({
      email: body.email ?? "",
      slug: body.slug ?? "",
      ipHash: requesterHash(request),
      marketingConsent: body.marketingConsent === true,
    });
    const response = NextResponse.json(
      { ok: true, delivery: result.delivery },
      { status: result.delivery === "sent" ? 200 : 202 },
    );
    response.cookies.set(
      REPORT_ACCESS_COOKIE,
      createReportAccessToken(body.slug ?? ""),
      reportAccessCookieOptions(),
    );
    return response;
  } catch (e) {
    if (e instanceof LeadError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Could not save that — try again." }, { status: 500 });
  }
}
