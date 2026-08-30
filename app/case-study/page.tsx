import type { Metadata } from "next";
import WebMCPTools from "@/components/WebMCPTools";

export const metadata: Metadata = {
  title: "Case study: Invisible to Callable in one night",
  description:
    "The Agent Surface Scan scanned itself, scored rung 0, and climbed its own ladder to Callable — every step evidenced on a public, dated scan page.",
};

export default function CaseStudy() {
  return (
    <main className="wrap article">
      <WebMCPTools mode="site" />
      <p className="kicker">Case study · 29 August 2026 · every claim links to stored evidence</p>
      <h1>Invisible to Callable in one night</h1>
      <p className="lede">
        The first site this scanner ever audited hard was itself. It did not go well — and that is
        the point of this page. The ladder is climbable, quickly, and here is the receipt.
      </p>

      <h2>23:00 — the scanner scans itself and scores rung 0</h2>
      <p>
        Hours after going live, we pointed the Scan at its own domain. Verdict: <strong>Invisible</strong>.
        No robots.txt, no sitemap, no llms.txt, no structured data — the same basics we flag on
        every scan, absent from the tool doing the flagging. The cobbler&apos;s children, measured
        and timestamped.
      </p>

      <h2>The climb — the same steps we prescribe</h2>
      <table>
        <thead>
          <tr><th>Step</th><th>Effort</th><th>Dimension it moved</th></tr>
        </thead>
        <tbody>
          <tr><td>robots.txt welcoming agents + sitemap.xml</td><td>Minutes</td><td>D1 Legibility</td></tr>
          <tr><td>llms.txt — what we are, in our words, for machines</td><td>An afternoon&apos;s writing, tops</td><td>D1 Legibility</td></tr>
          <tr><td>Structured data (what this application is, who made it)</td><td>Minutes</td><td>D1 + D5 Standing</td></tr>
          <tr><td>WebMCP tools registered on every page, with a detectable manifest</td><td>The <a href="/make-callable">guide&apos;s</a> ~30 lines</td><td>D3 Callability</td></tr>
          <tr><td>MCP discovery at <code>/.well-known/mcp</code>, pointing agents to the callable <code>/mcp</code> endpoint</td><td>An evening</td><td>D3 Callability</td></tr>
        </tbody>
      </table>

      <h2>By the small hours — rung 3, Callable, D3 = 100/100</h2>
      <p>
        The re-scan found the llms.txt, the markup, the registered tools and the MCP endpoint — and
        moved the verdict to <strong>Callable</strong>, the only rung-3 site in the corpus so far.
        Same scanner, same rules as every other site, evidence stored:{" "}
        <a href="/scan/scanwebmcp.vercel.app">the live, dated scan page is here</a>. It re-runs on
        demand; we cannot quietly edit history.
      </p>
      <p>
        Proof it isn&apos;t theoretical: open this site in ChatGPT&apos;s desktop browser and ask it
        to scan something. The tools this page registers are the ones it will use — and that
        interaction is how our <a href="/observatory">Observatory</a> logged its first real AI agent
        within an hour of launch.
      </p>

      <h2>What this means for your site</h2>
      <p>
        Every step above is available to any business, mostly without code. The distance from
        Invisible to Readable is a text file; from Readable to Callable is one exposed capability.
        The corpus says almost nobody has taken those steps yet — which is precisely the
        opportunity.
      </p>
      <section className="cta">
        <h2>Start where we started</h2>
        <p><a className="button" href="/">Scan your site</a></p>
      </section>
    </main>
  );
}
