import WebMCPTools from "@/components/WebMCPTools";
import ScanForm from "@/components/ScanForm";
import RecentScans from "@/components/RecentScans";
import AgentRotator from "@/components/AgentRotator";
import AgentAccessConstellation from "@/components/AgentAccessConstellation";
import LiveCorpusCounter from "@/components/LiveCorpusCounter";
import { getCorpusCounts, getObservatoryStats, type ObservatoryStats } from "@/lib/benchmark";
import Image from "next/image";
import type { Metadata } from "next";

export const revalidate = 300;
export const metadata: Metadata = {
  alternates: {
    canonical: "/",
    types: { "text/markdown": "/index.md" },
  },
};

const RUNGS = ["Invisible", "Readable", "Answerable", "Callable", "Transactable"];

export default async function Home({ searchParams }: PageProps<"/">) {
  const mode = (await searchParams).mode;
  if (mode === "agent") return <AgentMode />;

  const stats = await getObservatoryStats().catch(() => null);
  const counts = stats ?? await getCorpusCounts().catch(() => null);

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
          {counts ? (
            <LiveCorpusCounter
              initialSites={counts.sites}
              initialScans={counts.scans}
              variant="home"
            />
          ) : null}
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

function AgentMode() {
  return (
    <main className="wrap article editorial-page" data-agent-view="true">
      <h1>ScanWebMCP.com agent interface</h1>
      <p>
        Scan a public website and receive a dated Agent Surface Ladder result describing what AI
        agents can read, answer, and call. The service is free and requires no API key.
      </p>
      <h2>Preferred interfaces</h2>
      <ul>
        <li><a href="/openapi.json">OpenAPI 3.1</a> — typed REST operations and error schemas.</li>
        <li><a href="/mcp">MCP server</a> — Streamable HTTP tools at <code>/mcp</code>.</li>
        <li><a href="/skills/scan-webmcp/SKILL.md">Agent skill</a> — when-to-use and interpretation guidance.</li>
        <li><a href="/developers">Developer portal</a> — quickstart, limits, sandbox, and safety rules.</li>
      </ul>
      <h2>REST workflow</h2>
      <ol>
        <li>POST JSON <code>&#123;&quot;url&quot;:&quot;example.com&quot;,&quot;requester&quot;:&quot;agent&quot;&#125;</code> to <code>/api/scan</code>.</li>
        <li>Read the returned <code>slug</code>, <code>status</code>, cache status, and timestamps.</li>
        <li>GET <code>/api/scan/&#123;slug&#125;</code> for the public rung and dimension scores.</li>
      </ol>
      <h2>Constraints</h2>
      <p>
        The scanner fetches public pages only, honours robots.txt, refuses private network targets,
        and rate-limits repeated scans. Exact signals and evidence are email-gated; never guess or
        auto-fill an address. Authentication: none. Public sandbox target: <code>example.com</code>.
      </p>
      <p><a href="/llms.txt">Full machine-readable site index</a></p>
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
          <BentoHeading eyebrow="AI crawler access" title="See which AI products can reach the site" />
          <div className="constellation-wrap">
            <AgentAccessConstellation
              axes={[
                { label: "ChatGPT", detail: "explicitly allowed", treatment: "allowed" },
                { label: "GPTBot", detail: "allowed by default", treatment: "default" },
                { label: "Claude", detail: "explicitly allowed", treatment: "allowed" },
                { label: "ClaudeBot", detail: "blocked", treatment: "blocked" },
                { label: "Gemini", detail: "allowed by default", treatment: "default" },
                { label: "Perplexity", detail: "explicitly allowed", treatment: "allowed" },
              ]}
            />
          </div>
          <p className="muted small bento-caption">Example radial access map — every product is equally weighted; its dot shows the site&apos;s published treatment.</p>
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
