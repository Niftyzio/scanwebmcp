/**
 * Load domains into scan_queue for the daily cron drumbeat.
 * Usage: npx tsx scripts/queue-load.ts <csvfile>   (lines: domain,sector)
 *
 * Sector must be a slug from lib/sectors.ts (or blank). Lists live OUTSIDE
 * the repo — corpus composition is not part of the open source. Reads
 * .env.local for Supabase credentials. Already-queued or already-scanned
 * domains are skipped.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

for (const line of readFileSync(resolve(__dirname, "../.env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.+)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

async function main() {
  const { db } = await import("../lib/db");
  const { matchSector, SECTOR_TAXONOMY } = await import("../lib/sectors");
  const supabase = db();

  const file = process.argv[2];
  if (!file) throw new Error("Usage: npx tsx scripts/queue-load.ts <csvfile>");
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    console.error(`Can't find "${file}".`);
    console.error(`Create a CSV of websites to scan (one "domain,sector" per line) and point this script at it.`);
    process.exit(1);
  }
  const rows = raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const [domain, sector] = l.split(",").map((s) => s.trim());
      return { domain: domain?.replace(/^https?:\/\//, "").toLowerCase(), sector: sector ?? "" };
    })
    .filter((r) => r.domain);

  const bad = rows.filter((r) => r.sector && !matchSector(r.sector));
  if (bad.length) {
    console.error(`Unknown sectors (use slugs from lib/sectors.ts):`);
    for (const b of bad) console.error(`  ${b.domain}: "${b.sector}"`);
    console.error(`Valid slugs: ${SECTOR_TAXONOMY.map((s) => s.slug).join(", ")}`);
    process.exit(1);
  }

  const { data: existing } = await supabase.from("sites").select("domain");
  const known = new Set((existing ?? []).map((s) => s.domain));
  const fresh = rows.filter((r) => !known.has(r.domain));

  let queued = 0;
  for (const r of fresh) {
    const { error } = await supabase
      .from("scan_queue")
      .upsert(
        { domain: r.domain, sector: r.sector ? matchSector(r.sector)!.slug : null },
        { onConflict: "domain", ignoreDuplicates: true },
      );
    if (!error) queued++;
  }
  const { count: pending } = await supabase
    .from("scan_queue")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending");
  console.log(
    `${rows.length} rows read · ${rows.length - fresh.length} already in corpus · ${queued} queued.`,
  );
  console.log(`Queue now holds ${pending ?? 0} pending domains (~${Math.ceil((pending ?? 0) / 96)} days at the current drumbeat).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
