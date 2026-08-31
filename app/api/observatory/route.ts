import { NextResponse } from "next/server";
import { getObservatorySnapshot } from "@/lib/benchmark";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const snapshot = await getObservatorySnapshot();
    return NextResponse.json(snapshot, {
      headers: {
        // Near-live for visitors, shared briefly at the edge so an open page
        // does not turn into a database query per visitor every 30 seconds.
        "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30",
      },
    });
  } catch (error) {
    console.error("observatory_snapshot_failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Live Observatory data is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
