import WebMCPTools from "@/components/WebMCPTools";
import ScanForm from "@/components/ScanForm";
import RecentScans from "@/components/RecentScans";
import AgentRotator from "@/components/AgentRotator";
import { getObservatoryStats, type ObservatoryStats } from "@/lib/benchmark";
import Image from "next/image";

export const revalidate = 300;

const RUNGS = ["Invisible", "Readable", "Answerable", "Callable", "Transactable"];

export default async function Home() {
  const stats = await getObservatoryStats().catch(() => null);

  return (
    <main className="home-shell">
      <WebMCPTools mode="site" />
      <section className="home-hero" id="scan">
        <Image
          className="home-art"
          src="/hero-hands-wide-gap.png"
          width={1672}
          height={941}
          alt=""
          aria-hidden="true"
          priority
        />
        <div className="home-search">
          <p className="home-search-meta" aria-label="Scan details">
            <span>Free</span>
            <span>No login</span>
            <span>About 20 seconds</span>
          </p>
          <ScanForm />
        </div>
        <div className="home-copy">
          <h1>
            See what <AgentRotator />
            <br className="home-headline-break" />
            can do with your website.
          </h1>
          <p className="home-lede">A clear answer from real evidence.</p>
        </div>
      </section>

      <section className="home-explainer" aria-labelledby="how-it-works">
        <div>
          <p className="section-label">A simple answer, not a technical audit</p>
          <h2 id="how-it-works">Know where you stand—and what to do next.</h2>
          {stats && stats.sites >= 100 && (
            <p className="corpus-counter">
              <span className="corpus-count">{stats.sites.toLocaleString("en-GB")}</span> websites checked so far
              <span aria-hidden="true"> · </span><a href="/observatory">See the live benchmark</a>
            </p>
          )}
        </div>
        <ol className="home-steps">
          <li><span>01</span><strong>We look</strong><p>We check the public pages an AI agent can reach.</p></li>
          <li><span>02</span><strong>We explain</strong><p>You get a plain-English position on the Agent Surface Ladder.</p></li>
          <li><span>03</span><strong>You decide</strong><p>See the improvements and agent tools most worth building next.</p></li>
        </ol>
      </section>
      <FeatureShowcase stats={stats} />
      <div className="home-recent"><RecentScans /></div>
    </main>
  );
}

function FeatureShowcase({ stats }: { stats: ObservatoryStats | null }) {
  const corpusSize = Object.values(stats?.rungDist ?? {}).reduce((sum, n) => sum + n, 0);
  const maxRung = Math.max(1, ...Object.values(stats?.rungDist ?? {}));

  return (
    <section className="feature-showcase" aria-labelledby="feature-showcase-title">
      <div className="feature-showcase-head">
        <div>
          <p className="kicker">Not just another website score</p>
          <h2 id="feature-showcase-title">One scan turns a website into an agent-readiness map</h2>
        </div>
        <p>
          See what agents can read, answer and do; compare it with the live corpus; then get the
          first tools worth exposing — with the source evidence beside every recommendation.
        </p>
      </div>

      <div className="bento-grid">
        <article className="bento-card bento-ladder">
          <BentoHeading eyebrow="Live benchmark" title="See where the market actually sits" />
          <p className="muted small">
            Every completed site is placed on the same published five-rung rubric. The distribution
            updates as the corpus grows.
          </p>
          {stats && corpusSize > 0 ? (
            <div className="mini-rung-chart" aria-label={`Live ladder distribution across ${corpusSize} websites`}>
              {RUNGS.map((name, rung) => {
                const count = stats.rungDist[rung] ?? 0;
                return (
                  <div className="mini-rung-column" key={name}>
                    <span className="mini-rung-count">{count}</span>
                    <div className="mini-rung-track">
                      <span style={{ height: `${Math.max(count ? 8 : 0, (count / maxRung) * 100)}%` }} />
                    </div>
                    <span className="mini-rung-name">{name}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="bento-empty">The live corpus chart appears when benchmark data is available.</p>
          )}
          <a className="bento-link" href="/observatory">Explore the Observatory →</a>
        </article>

        <article className="bento-card bento-profile">
          <BentoHeading eyebrow="Five dimensions" title="See the shape behind the score" />
          <div className="radar-wrap">
            <svg className="radar-chart" viewBox="0 0 240 220" role="img" aria-label="Example five-dimension scan profile for legibility, answerability, callability, transactability and standing">
              <g className="radar-grid">
                <polygon points="120,22 213,90 178,198 62,198 27,90" />
                <polygon points="120,46 190,97 164,178 76,178 50,97" />
                <polygon points="120,71 166,104 149,158 91,158 74,104" />
                <line x1="120" y1="110" x2="120" y2="22" />
                <line x1="120" y1="110" x2="213" y2="90" />
                <line x1="120" y1="110" x2="178" y2="198" />
                <line x1="120" y1="110" x2="62" y2="198" />
                <line x1="120" y1="110" x2="27" y2="90" />
              </g>
              <polygon className="radar-value" points="120,43 174,98 142,143 108,128 61,97" />
              <g className="radar-points">
                <circle cx="120" cy="43" r="4" /><circle cx="174" cy="98" r="4" />
                <circle cx="142" cy="143" r="4" /><circle cx="108" cy="128" r="4" />
                <circle cx="61" cy="97" r="4" />
              </g>
              <g className="radar-labels">
                <text x="120" y="13" textAnchor="middle">Read</text>
                <text x="218" y="88">Answer</text>
                <text x="183" y="211">Act</text>
                <text x="57" y="211" textAnchor="end">Transact</text>
                <text x="22" y="88" textAnchor="end">Standing</text>
              </g>
            </svg>
          </div>
          <p className="muted small bento-caption">Example scan profile — the report includes scores and benchmark context for every axis.</p>
        </article>

        <article className="bento-card bento-tools">
          <BentoHeading eyebrow="Agent tool blueprint" title="Discover what your site could let agents do" />
          <p className="muted small">
            We map observed forms, booking paths, pricing and content into concrete tool ideas. No
            LLM guesswork: each proposal is generated by rules from evidence the scanner found.
          </p>
          <div className="mini-opportunity-map" role="img" aria-label="Example opportunity map with request quote at high value and medium effort, and search insights at medium-high value and low effort">
            <span className="mini-map-label mini-map-y">Higher value</span>
            <span className="mini-map-label mini-map-x">More effort</span>
            <span className="mini-map-best">Best first</span>
            <span className="mini-tool-point point-quote"><b>1</b><em>request_quote</em></span>
            <span className="mini-tool-point point-search"><b>2</b><em>search_insights</em></span>
          </div>
          <p className="bento-note"><strong>Two recommendations are revealed in the free report.</strong> Contact us to map the capabilities behind your public pages.</p>
        </article>

        <article className="bento-card bento-access">
          <BentoHeading eyebrow="Agent access" title="Separate AI search from model training" />
          <p className="muted small">
            We inspect six published controls and explain what each one governs, instead of treating
            every AI bot as the same visitor.
          </p>
          <div className="mini-access-matrix" role="table" aria-label="Crawler checks performed by the scanner">
            <div role="row" className="mini-access-head"><span>Product</span><span>Search</span><span>AI use</span></div>
            <div role="row"><strong>ChatGPT</strong><span>OAI-SearchBot</span><span>GPTBot</span></div>
            <div role="row"><strong>Claude</strong><span>Claude-SearchBot</span><span>ClaudeBot</span></div>
            <div role="row"><strong>Gemini</strong><span>Google Search rules</span><span>Google-Extended</span></div>
            <div role="row"><strong>Perplexity</strong><span>PerplexityBot</span><span>Not for training</span></div>
          </div>
        </article>

        <article className="bento-card bento-evidence">
          <BentoHeading eyebrow="Verifiable by design" title="Follow every claim back to what the agent saw" />
          <div className="evidence-chain" aria-label="Evidence chain from public URL to observation, score and recommendation">
            <span><b>01</b> Public URL</span><i>→</i><span><b>02</b> Observation</span><i>→</i>
            <span><b>03</b> Rubric score</span><i>→</i><span><b>04</b> Recommended move</span>
          </div>
          <p className="muted small">
            Exact source URL, timestamp and safe evidence snippet sit beside every result. If the
            scanner cannot measure something, it says unmeasured — never zero.
          </p>
        </article>

        <article className="bento-card bento-report">
          <BentoHeading eyebrow="A report worth keeping" title="Your complete findings, delivered by email" />
          <div className="mini-report-stack" aria-hidden="true"><span /><span /><span /></div>
          <p>
            The public verdict shows where the site sits. The email gate unlocks the full evidence,
            benchmark, recommendations and copyable implementation prompt — for humans and agents alike.
          </p>
          <a className="button" href="#scan">Scan your website</a>
        </article>
      </div>
    </section>
  );
}

function BentoHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <header className="bento-heading">
      <span>{eyebrow}</span>
      <h3>{title}</h3>
    </header>
  );
}
