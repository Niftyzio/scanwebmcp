import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requestScan } from "@/lib/scan-service";

/**
 * The corpus drumbeat: Supabase pg_cron calls this route on schedule. It claims
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
  const { data: items, error: claimError } = await supabase.rpc("claim_scan_queue", {
    batch_size: Math.min(Math.max(BATCH, 1), 2),
  });
  if (claimError)
    return NextResponse.json({ error: `queue claim failed: ${claimError.message}` }, { status: 500 });

  const results: { domain: string; ok: boolean; note: string }[] = [];
  for (const item of items ?? []) {
    // Render-backfill rows (queued by scan-service when the WebMCP renderer
    // was unavailable) re-scan as "rescan", not "seed": they must not mark
    // visitor domains as corpus members, and they need the shorter cache
    // window so the render actually re-runs.
    const isBackfill = item.error === "render_backfill" || item.error === "backfill_waiting_cooldown";
    try {
      const r = await requestScan({
        url: item.domain,
        trigger: isBackfill ? "rescan" : "seed",
        requesterType: "human",
        userAgent: "queue-runner/0.1",
        sector: item.sector ?? undefined,
      });
      if (isBackfill && r.cached) {
        // Re-scan cooldown still holds — defer to a later tick without
        // spending an attempt.
        const { error } = await supabase
          .from("scan_queue")
          .update({ status: "pending", attempts: Math.max(item.attempts - 1, 0), error: "backfill_waiting_cooldown" })
          .eq("id", item.id);
        if (error) throw new Error(`Could not defer backfill: ${error.message}`);
        results.push({ domain: item.domain, ok: true, note: "backfill deferred (cooldown)" });
        continue;
      }
      if (!isBackfill) {
        const { error } = await supabase
          .from("sites")
          .update({ is_seed: true })
          .eq("domain", item.domain.replace(/^https?:\/\//, "").toLowerCase());
        if (error) throw new Error(`Could not mark seed site: ${error.message}`);
      }
      const { error: doneError } = await supabase
        .from("scan_queue")
        .update({ status: "done", processed_at: new Date().toISOString() })
        .eq("id", item.id);
      if (doneError) throw new Error(`Could not finish queue row: ${doneError.message}`);
      results.push({ domain: item.domain, ok: true, note: r.cached ? "cached" : isBackfill ? "backfilled" : "scanned" });
    } catch (e) {
      const note = e instanceof Error ? e.message.slice(0, 200) : "error";
      // One retry on a later tick; after that the row records why it failed.
      const { error: failureError } = await supabase
        .from("scan_queue")
        .update({
          status: item.attempts >= 2 ? "failed" : "pending",
          error: note,
          processed_at: new Date().toISOString(),
        })
        .eq("id", item.id);
      results.push({
        domain: item.domain,
        ok: false,
        note: failureError ? `${note}; queue update failed: ${failureError.message}` : note,
      });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}
