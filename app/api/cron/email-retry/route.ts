import { NextResponse } from "next/server";
import { flushPendingReports } from "@/lib/leads";

export const maxDuration = 30;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await flushPendingReports(5));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "retry failed" },
      { status: 500 },
    );
  }
}
