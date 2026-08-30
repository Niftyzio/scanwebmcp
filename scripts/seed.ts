/**
 * Seed runner — pre-launch benchmark corpus (spec §8).
 * Usage: npx tsx scripts/seed.ts <csvfile>   (lines: domain,sector)
 *
 * Scans run through the same requestScan path as product traffic, marked
 * trigger='seed'; sites get sector + is_seed. Concurrency 3, polite pacing.
 * Reads .env.local for Supabase credentials.
 */
import { readFileSync } from "node:fs";
import { loadLocalEnv } from "./load-local-env";

loadLocalEnv();

async function main() {
  const { requestScan } = await import("../lib/scan-service");
  const { db } = await import("../lib/db");

  const file = process.argv[2];
  if (!file) throw new Error("Usage: npx tsx scripts/seed.ts <csvfile>");
  const rows = readFileSync(file, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const [domain, sector] = l.split(",").map((s) => s.trim());
      return { domain, sector };
    })
    .filter((r) => r.domain && r.sector);

  console.log(`Seeding ${rows.length} sites…`);
  const results: { domain: string; sector: string; ok: boolean; note: string }[] = [];
  let active = 0;
  let idx = 0;

  await new Promise<void>((done) => {
    const next = () => {
      if (idx >= rows.length && active === 0) return done();
      while (active < 3 && idx < rows.length) {
        const row = rows[idx++];
        active++;
        (async () => {
          try {
            const r = await requestScan({
              url: row.domain,
              trigger: "seed",
              requesterType: "human",
              userAgent: "seed-runner/0.1",
            });
            const { error } = await db()
              .from("sites")
              .update({ sector: row.sector, is_seed: true })
              .eq("domain", row.domain.replace(/^https?:\/\//, "").toLowerCase());
            if (error) throw new Error(`site update failed: ${error.message}`);
            results.push({ ...row, ok: true, note: r.cached ? "cached" : "scanned" });
          } catch (e) {
            results.push({ ...row, ok: false, note: e instanceof Error ? e.message.slice(0, 80) : "error" });
          } finally {
            active--;
            const n = results.length;
            if (n % 10 === 0) console.log(`  ${n}/${rows.length} done`);
            setTimeout(next, 400);
          }
        })();
      }
    };
    next();
  });

  const failed = results.filter((r) => !r.ok);
  console.log(`\nDone: ${results.length - failed.length} ok, ${failed.length} failed.`);
  for (const f of failed) console.log(`  FAIL ${f.domain}: ${f.note}`);

  const { data, error: distributionError } = await db()
    .from("scans")
    .select("rung, sites!inner(sector)")
    .eq("trigger", "seed")
    .eq("status", "complete");
  if (distributionError) throw new Error(`distribution read failed: ${distributionError.message}`);
  const dist = new Map<string, Map<number, number>>();
  for (const s of (data ?? []) as unknown as { rung: number; sites: { sector: string } }[]) {
    const sec = s.sites?.sector ?? "?";
    const rungs = dist.get(sec) ?? new Map<number, number>();
    rungs.set(s.rung, (rungs.get(s.rung) ?? 0) + 1);
    dist.set(sec, rungs);
  }
  console.log("\nRung distribution by sector:");
  console.log(JSON.stringify(Object.fromEntries(
    [...dist].map(([sector, rungs]) => [sector, Object.fromEntries(rungs)]),
  ), null, 1));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
