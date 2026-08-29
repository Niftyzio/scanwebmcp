import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requestScan } from "@/lib/scan-service";

/**
 * The corpus drumbeat: every 15 minutes (vercel.json cron) this pops one
 * domain off scan_queue and scans it as seed traffic — ~96 sites a day, the
 * number on the homepage climbing daily. Queue is loaded out-of-repo
 * (scripts/queue-load.ts) because corpus composition is not open source.
 * Protected by CRON_SECRET (Vercel sends it as a Bearer token to cron
 * invocations); without the env var set, the route refuses to run.
 */
export const maxDuration = 60;

const BATCH = Number(process.env.QUEUE_BATCH ?? 1);

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const supabase = db();
  const { data: items } = await supabase
    .from("scan_queue")
    .select("id, domain, sector, attempts")
    .eq("status", "pending")
    .order("id")
    .limit(Math.min(Math.max(BATCH, 1), 2));

  const results: { domain: string; ok: boolean; note: string }[] = [];
  for (const item of items ?? []) {
    await supabase
      .from("scan_queue")
      .update({ status: "running", attempts: item.attempts + 1 })
      .eq("id", item.id);
    try {
      const r = await requestScan({
        url: item.domain,
        trigger: "seed",
        requesterType: "human",
        userAgent: "queue-runner/0.1",
        sector: item.sector ?? undefined,
      });
      await supabase
        .from("sites")
        .update({ is_seed: true })
        .eq("domain", item.domain.replace(/^https?:\/\//, "").toLowerCase());
      await supabase
        .from("scan_queue")
        .update({ status: "done", processed_at: new Date().toISOString() })
        .eq("id", item.id);
      results.push({ domain: item.domain, ok: true, note: r.cached ? "cached" : "scanned" });
    } catch (e) {
      const note = e instanceof Error ? e.message.slice(0, 200) : "error";
      // One retry on a later tick; after that the row records why it failed.
      await supabase
        .from("scan_queue")
        .update({
          status: item.attempts + 1 >= 2 ? "failed" : "pending",
          error: note,
          processed_at: new Date().toISOString(),
        })
        .eq("id", item.id);
      results.push({ domain: item.domain, ok: false, note });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}
