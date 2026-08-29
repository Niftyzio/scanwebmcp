/**
 * Backfill: content_library_links for scans that predate the signal.
 *
 * The content-library detector shipped after the seed run, so the 300 seed
 * scans carry no content_library_links row and the two library opportunity
 * templates could never fire for them. This script runs ONLY the library
 * detector (homepage + sitemap fetch) against each completed, non-degraded
 * scan that lacks the signal, inserts the missing row, and then re-derives
 * the stored opportunities for scans where a library template now applies.
 *
 * Usage: npx tsx scripts/backfill-content-library.ts [--dry-run]
 * Reads .env.local for Supabase credentials. Idempotent — re-running skips
 * scans that already have the signal.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Load .env.local (tsx doesn't)
for (const line of readFileSync(resolve(__dirname, "../.env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.+)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const { detectContentLibrary, fetchHomepageForBackfill, validateTarget } =
    await import("../lib/engine");
  const { pickOpportunities } = await import("../lib/opportunities");
  const { db } = await import("../lib/db");
  type ScanResultLike = Parameters<typeof pickOpportunities>[0];
  const supabase = db();

  // Targets: completed scans where the page set was actually measured
  // (forms_as_latent_tools present ⇒ not a degraded/blocked scan) but the
  // library signal is missing. Blocked scans stay unmeasured — degraded
  // scans must never present unmeasured signals as findings.
  const { data: markers, error: mErr } = await supabase
    .from("signals")
    .select("scan_id, signal_key")
    .in("signal_key", ["forms_as_latent_tools", "content_library_links"]);
  if (mErr) throw new Error(mErr.message);
  const measured = new Set<number>();
  const alreadyDone = new Set<number>();
  for (const row of markers ?? []) {
    if (row.signal_key === "forms_as_latent_tools") measured.add(row.scan_id);
    else alreadyDone.add(row.scan_id);
  }
  const targetIds = [...measured].filter((id) => !alreadyDone.has(id));

  const { data: scans, error: sErr } = await supabase
    .from("scans")
    .select("id, rung, sites!inner(domain)")
    .eq("status", "complete")
    .in("id", targetIds);
  if (sErr) throw new Error(sErr.message);
  const targets = (scans ?? []) as unknown as {
    id: number;
    rung: number;
    sites: { domain: string };
  }[];
  console.log(
    `${measured.size} scans have page signals; ${alreadyDone.size} already carry the library signal; backfilling ${targets.length}${DRY_RUN ? " (dry run)" : ""}…`,
  );

  const tally: Record<string, number> = {};
  const failed: { domain: string; note: string }[] = [];
  let regenerated = 0;
  let done = 0;
  let active = 0;
  let idx = 0;

  await new Promise<void>((finish) => {
    const next = () => {
      if (idx >= targets.length && active === 0) return finish();
      while (active < 3 && idx < targets.length) {
        const t = targets[idx++];
        active++;
        (async () => {
          try {
            const { origin } = validateTarget(t.sites.domain);
            const home = await fetchHomepageForBackfill(origin);
            if (!home.ok) throw new Error(`homepage now unreachable (${home.status})`);
            const signal = await detectContentLibrary(origin, home.body);
            tally[signal.valueText ?? "?"] = (tally[signal.valueText ?? "?"] ?? 0) + 1;

            if (!DRY_RUN) {
              const { error } = await supabase.from("signals").insert({
                scan_id: t.id,
                dimension: signal.dimension,
                signal_key: signal.signalKey,
                value_bool: signal.valueBool ?? null,
                value_num: signal.valueNum ?? null,
                value_text: signal.valueText ?? null,
                evidence_url: signal.evidenceUrl,
                evidence_snippet: null,
                observed_at: signal.observedAt,
              });
              if (error) throw new Error(`insert failed: ${error.message}`);

              // Re-derive opportunities only where a library template can now
              // fire — other scans keep their stored recommendations.
              const libraryRelevant =
                (signal.valueNum ?? 0) >= 8 ||
                signal.valueText === "section_exists_articles_not_enumerable";
              if (libraryRelevant) {
                const { data: sigRows } = await supabase
                  .from("signals")
                  .select("*")
                  .eq("scan_id", t.id);
                const r = {
                  rung: t.rung,
                  signals: (sigRows ?? []).map((row) => ({
                    dimension: row.dimension,
                    signalKey: row.signal_key,
                    valueBool: row.value_bool ?? undefined,
                    valueNum: row.value_num == null ? undefined : Number(row.value_num),
                    valueText: row.value_text ?? undefined,
                    evidenceUrl: row.evidence_url,
                    observedAt: row.observed_at,
                  })),
                } as unknown as ScanResultLike;
                const opportunities = pickOpportunities(r);
                if (opportunities.some((o) => o.templateKey.startsWith("content_library"))) {
                  await supabase.from("opportunities").delete().eq("scan_id", t.id);
                  await supabase.from("opportunities").insert(
                    opportunities.map((o) => ({
                      scan_id: t.id,
                      rank: o.rank,
                      template_key: o.templateKey,
                      rendered_text: `**${o.title}** — ${o.text}`,
                      impact: o.impact,
                      ease: o.ease,
                    })),
                  );
                  regenerated++;
                }
              }
            }
          } catch (e) {
            failed.push({
              domain: t.sites.domain,
              note: e instanceof Error ? e.message.slice(0, 80) : "error",
            });
          } finally {
            active--;
            done++;
            if (done % 25 === 0) console.log(`  ${done}/${targets.length} done`);
            setTimeout(next, 400);
          }
        })();
      }
    };
    next();
  });

  console.log(`\nDone: ${done - failed.length} backfilled, ${failed.length} failed.`);
  console.log("Library detection outcomes:", JSON.stringify(tally, null, 1));
  console.log(`Opportunities re-derived for ${regenerated} scans (library template now shows).`);
  for (const f of failed) console.log(`  FAIL ${f.domain}: ${f.note}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
