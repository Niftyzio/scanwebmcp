import type { Metadata } from "next";
import WebMCPTools from "@/components/WebMCPTools";

export const metadata: Metadata = {
  title: "The Agent Opportunity Map",
  description:
    "A fixed-scope engagement: the full catalogue of your business capabilities worth exposing to AI agents — prioritised, sequenced, with the first tool specced.",
};

export default function MapPage() {
  return (
    <main className="wrap article">
      <WebMCPTools mode="site" />
      <p className="kicker">The paid engagement behind the free scan · fixed scope · 1–2 weeks</p>
      <h1>The Agent Opportunity Map</h1>
      <p className="lede">
        The scan tells you where you stand. The Map answers the question that follows:{" "}
        <em>which of your capabilities are worth exposing to agents, in what order, and what is
        each one worth?</em>
      </p>

      <h2>What you get</h2>
      <ul>
        <li><strong>A full capability catalogue</strong> — everything your business does that an agent could invoke: enquiries, scoping, quoting, booking, eligibility checks, calculators — each defined with a name, description and input schema, the way agents actually consume them.</li>
        <li><strong>Prioritisation and sequencing</strong> — ranked by commercial value and ease, so you climb the Ladder in the order that pays.</li>
        <li><strong>The first tool specced in full</strong> — and one worked example implemented live during the engagement, so you leave with something an agent can call that week.</li>
        <li><strong>A decision asset, not a dependency</strong> — the catalogue is protocol-agnostic (MCP today, WebMCP as browsers arrive, whatever follows both). If a standard changes, your map doesn&apos;t.</li>
      </ul>

      <h2>How it runs</h2>
      <p>
        Fixed fee, one to two weeks, working alongside your team rather than instead of it — you end
        up owning the map and understanding it. Delivered by{" "}
        <a href="https://www.linkedin.com/in/sarasimeone/" rel="author">Sara Simeone</a> (Agentic
        Sara), author of the <a href="/ladder">Agent Surface Ladder</a>.
      </p>

      <section className="cta">
        <h2>Start the conversation</h2>
        <p>
          <a
            className="button"
            href="mailto:sara@nocodelab.ai?subject=Agent%20Opportunity%20Map&body=My%20scan%3A%20(paste%20your%20result%20URL)"
          >
            Enquire about the Map
          </a>
        </p>
        <p className="muted small">
          Include your scan result URL — the Map starts from your evidence, not a blank page. Not
          scanned yet? <a href="/">Two minutes, free.</a>
        </p>
      </section>
    </main>
  );
}
