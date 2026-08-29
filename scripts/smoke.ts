import { runScan } from "../lib/engine";

async function main() {
const targets = process.argv.slice(2);
for (const t of targets) {
  const r = await runScan(t);
  console.log(
    `${r.domain}: rung ${r.rung} (${r.rungName}) · D1 ${r.scores.d1} D2 ${r.scores.d2} D3 ${r.scores.d3} D4 ${r.scores.d4} D5 ${r.scores.d5} · composite ${r.scores.composite} · pages ${r.pagesScanned.length} · signals ${r.signals.length}${r.errors.length ? " · ERRORS: " + r.errors.join("; ") : ""}`,
  );
  for (const s of r.signals) {
    const v = s.valueBool ?? s.valueNum ?? "";
    console.log(`   ${s.dimension} ${s.signalKey} = ${v} ${s.valueText ?? ""}`);
  }
}

}
main();
