import { NextResponse } from "next/server";
import { probeWebMCP } from "@/lib/render";

export const maxDuration = 60;

/** Temporary preview-only verification for PR #27. Removed before merge. */
export async function GET() {
  if (process.env.VERCEL_ENV !== "preview") {
    return new NextResponse(null, { status: 404 });
  }
  const probe = await probeWebMCP("https://www.awaytravel.com/");
  return NextResponse.json({
    ok: probe.ok,
    renderer: probe.renderer,
    browserVersion: probe.browserVersion,
    witnessAvailable: probe.witnessAvailable,
    activeToolNames: probe.activeToolNames,
    error: probe.error,
  });
}
