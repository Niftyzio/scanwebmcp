import type { Metadata } from "next";
import { getObservatoryStats } from "@/lib/benchmark";
import WebMCPTools from "@/components/WebMCPTools";

export const metadata: Metadata = {
  title: "The Agent Surface Observatory",
  description:
    "Live findings from the Agent Surface Scan corpus: how readable, answerable and callable the business web actually is for AI agents.",
};
export const dynamic = "force-dynamic";
export const revalidate = 0;

const RUNGS = ["Invisible", "Readable", "Answerable", "Callable", "Transactable"];

export default async function Observatory() {
  const s = await getObservatoryStats();
  const totalGraded = Object.values(s.rungDist).reduce((a, b) => a + b, 0) || 1;

  return (
    <main className="wrap">
      <WebMCPTools mode="site" />
      <p className="kicker">Live corpus data · updates with every scan · started 29 August 2026</p>
      <h1>The Agent Surface Observatory</h1>
      <p className="lede">
        What AI agents actually find when they visit the business web — measured, not estimated.
        Every number below comes from real scans with stored evidence.
      </p>

      <div className="stat-grid">
        <div className="stat"><span className="stat-num">{s.pctBlockingAnyAiBot}%</span> block at least one major AI crawler in robots.txt</div>
        <div className="stat"><span className="stat-num">{s.pctWafBlocked}%</span> turn automated agents away at the firewall</div>
        <div className="stat"><span className="stat-num">{s.pctLlmsTxt}%</span> publish an llms.txt agent summary</div>
        <div className="stat"><span className="stat-num">{s.pctSellsMarkup}%</span> have machine-readable markup for what they sell</div>
        <div className="stat"><span className="stat-num">{s.pctAnyCallable}%</span> expose anything an agent can call</div>
        <div className="stat"><span className="stat-num">{s.totalLatentForms}</span> forms found — latent tools waiting for a schema</div>
      </div>

      <h2>The ladder, as the web actually stands</h2>
      <div className="dist">
        {RUNGS.map((name, i) => {
          const count = s.rungDist[i] ?? 0;
          const pct = Math.round((count / totalGraded) * 100);
          return (
            <div key={name} className="dist-row">
              <span className="dist-label">{i} · {name}</span>
              <span className="dist-bar-track">
                <span className="dist-bar" style={{ width: `${Math.max(pct, 1)}%` }} />
              </span>
              <span className="dist-count">{count} site{count === 1 ? "" : "s"} · {pct}%</span>
            </div>
          );
        })}
      </div>

      <h2>By sector</h2>
      <table>
        <thead>
          <tr><th>Sector</th><th>Sites</th><th>Invisible</th><th>Readable</th><th>Answerable</th><th>Callable+</th></tr>
        </thead>
        <tbody>
          {s.bySector.map((row) => (
            <tr key={row.sector}>
              <td>{row.sector}</td>
              <td>{row.n}</td>
              <td>{row.rungs[0] ?? 0}</td>
              <td>{row.rungs[1] ?? 0}</td>
              <td>{row.rungs[2] ?? 0}</td>
              <td>{(row.rungs[3] ?? 0) + (row.rungs[4] ?? 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">
        The lone Callable entry above is this site itself — scanned by the same rules as everyone
        else, and it started the night at rung 0.{" "}
        <a href="/case-study">Read the case study →</a> Sector percentiles appear on result
        pages once a sector reaches 30 scanned sites. Corpus:
        {" "}{s.sites} sites · {s.scans} scans · {s.signalsStored.toLocaleString()} stored signals ·{" "}
        {s.agentHits} tool calls made by AI agents against this site&apos;s own WebMCP surface.
      </p>

      <section className="cta">
        <h2>Where does your site stand?</h2>
        <p><a className="button" href="/">Run your scan</a></p>
      </section>
    </main>
  );
}
