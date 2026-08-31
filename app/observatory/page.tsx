import type { Metadata } from "next";
import { getObservatoryStats } from "@/lib/benchmark";
import WebMCPTools from "@/components/WebMCPTools";
import LiveObservatoryCorpus from "@/components/LiveObservatoryCorpus";
import { getShopifyWebMCPCohortStats } from "@/lib/shopify-webmcp-cohort";

export const metadata: Metadata = {
  title: "The ScanWebMCP Observatory",
  description:
    "Live findings from the ScanWebMCP.com corpus: how readable, answerable and callable the business web actually is for AI agents.",
};
export const dynamic = "force-dynamic";
export const revalidate = 0;

const RUNGS = ["Invisible", "Readable", "Answerable", "Callable", "Transactable"];
const shopifyCohort = getShopifyWebMCPCohortStats();

export default async function Observatory() {
  const s = await getObservatoryStats();
  const totalGraded = Object.values(s.rungDist).reduce((a, b) => a + b, 0) || 1;

  return (
    <main className="wrap editorial-page editorial-observatory">
      <WebMCPTools mode="site" />
      <p className="kicker">Live corpus data · updates with every scan · started 29 August 2026</p>
      <h1>The ScanWebMCP Observatory</h1>
      <p className="lede">
        What AI agents actually find when they visit the business web — measured, not estimated.
        Every number below comes from real scans with stored evidence.
      </p>

      <LiveObservatoryCorpus
        initialSnapshot={{ sites: s.sites, scans: s.scans, bySector: s.bySector }}
        signalsStored={s.signalsStored}
        agentHits={s.agentHits}
        agentHitOutcomes={s.agentHitOutcomes}
      >
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
      </LiveObservatoryCorpus>

      <section className="observatory-field-note">
        <p className="kicker">Field note · Shopify WebMCP</p>
        <div>
          <strong>{shopifyCohort.productionVerified}/{shopifyCohort.total}</strong>
          <h2>Known-positive storefronts independently verified in production</h2>
          <p>
            In a deliberately selected six-store validation cohort, five exposed a live WebMCP registry
            to the production scanner. Local Chrome verified 14 tools on the sixth. This measures scanner
            coverage, not Shopify-wide adoption.
          </p>
          <a href="/case-study/shopify-webmcp">Read the Shopify WebMCP field study →</a>
        </div>
      </section>

      <section className="cta">
        <h2>Where does your site stand?</h2>
        <p><a className="button" href="/">Run your scan</a></p>
      </section>
    </main>
  );
}
