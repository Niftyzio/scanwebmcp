import { NextResponse } from "next/server";
import {
  readReportAccessToken,
  REPORT_ACCESS_COOKIE,
  reportAccessCookieOptions,
} from "@/lib/report-access";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const access = readReportAccessToken(token);
  if (!access) {
    return NextResponse.json({ error: "This report link is invalid or has expired." }, { status: 400 });
  }

  const destination = new URL(`/scan/${access.slug}`, request.url);
  const response = NextResponse.redirect(destination);
  response.cookies.set(REPORT_ACCESS_COOKIE, token, reportAccessCookieOptions());
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
