import { NextResponse } from "next/server";
import { confirmMarketingUpdates } from "@/lib/leads";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  try {
    const confirmed = await confirmMarketingUpdates(token);
    return new NextResponse(
      confirmed
        ? "Benchmark updates confirmed. You can close this tab."
        : "This confirmation link is invalid or has already been used.",
      { status: confirmed ? 200 : 400, headers: { "Content-Type": "text/plain; charset=utf-8" } },
    );
  } catch {
    return new NextResponse("Confirmation is temporarily unavailable.", { status: 500 });
  }
}
