import type { Metadata } from "next";
import WebMCPTools from "@/components/WebMCPTools";

export const metadata: Metadata = {
  title: "The Agent Surface Ladder v1.0",
  description:
    "A published, versioned rubric for how much of a business an AI agent can see, understand, and act on.",
};

const RUNGS = [
  ["Invisible", "Agents are blocked in robots.txt, or your core content doesn't exist without JavaScript. Agents cannot reliably read you at all."],
  ["Readable", "An agent can retrieve your pages and understand what you do."],
  ["Answerable", "An agent can answer a buyer's real questions — what you offer, for whom, at what price band, with what availability — without a human stepping in."],
  ["Callable", "At least one of your capabilities is invocable: an MCP endpoint, a documented API, or a registered WebMCP tool."],
  ["Transactable", "An agent can complete a meaningful action end to end — book, order, submit, purchase — with human confirmation rather than human labour."],
];

const DIMENSIONS = [
  ["D1 Legibility", "25%", "Can an agent read you at all? robots.txt agent directives, llms.txt, content without JavaScript, sitemap, structured data, title/meta coherence — and whether you serve agents an optimised representation."],
  ["D2 Answerability", "30%", "Can an agent answer a buyer's question about you? Price specificity, service definitions, FAQ coverage, and whether those pages are even discoverable."],
  ["D3 Callability", "20%", "Is there anything an agent can invoke? Validated MCP endpoint probes, WebMCP registrations, booking embeds — and forms, which are tools with a schema waiting to be written."],
  ["D4 Transactability", "15%", "How far from intent to commitment? Contact affordances, friction markers, steps to action."],
  ["D5 Standing", "10%", "Would an agent trust and cite you? Entity clarity, named people, consistency. (Deliberately crude in v1; the weight rises as measurement improves.)"],
];

export default function LadderPage() {
  return (
    <main className="wrap article">
      <WebMCPTools mode="site" />
      <p className="kicker">Rubric version 1.0.0 · published September 2026 · by Sara Simeone (Agentic Sara)</p>
      <h1>The Agent Surface Ladder</h1>
      <p className="lede">
        A published, versioned rubric for how much of a business an AI agent can see, understand,
        and act on.
      </p>
      <p>
        AI agents stopped being hypothetical visitors this year. ChatGPT&apos;s desktop browser
        executes website-registered tools as of 25 August 2026; Chrome is trialling the same
        standard (WebMCP); Claude and ChatGPT have called MCP endpoints for over a year. The
        question for a business is no longer <em>whether</em> agents will visit, but what they find
        when they do: something to read, something to ask, something to call — or nothing at all.
      </p>
      <p>
        The Ladder names five positions. A business sits on the highest rung it fully satisfies.
        Every rung is a position of opportunity: the point is never that you have failed a check,
        but that the next rung is specific, nearby, and nameable.
      </p>

      <h2>The five rungs</h2>
      <table>
        <thead>
          <tr><th>Rung</th><th>Name</th><th>You are here if…</th></tr>
        </thead>
        <tbody>
          {RUNGS.map(([name, def], i) => (
            <tr key={name}><td>{i}</td><td><strong>{name}</strong></td><td>{def}</td></tr>
          ))}
        </tbody>
      </table>
      <p>
        Rungs are gated: you cannot be Callable while Invisible — an endpoint nobody can discover
        doesn&apos;t count.
      </p>

      <h2>What is measured</h2>
      <p>
        Five dimensions feed the rung and the composite score. Weights are published because a
        rubric you can&apos;t inspect is an opinion, not a standard.
      </p>
      <table>
        <thead>
          <tr><th>Dimension</th><th>Weight</th><th>What it asks</th></tr>
        </thead>
        <tbody>
          {DIMENSIONS.map(([d, w, q]) => (
            <tr key={d}><td><strong>{d}</strong></td><td>{w}</td><td>{q}</td></tr>
          ))}
        </tbody>
      </table>

      <p>Two measurement rules distinguish this rubric from a checklist:</p>
      <ol>
        <li>
          <strong>Evidence, not opinion.</strong> Every finding records what was observed, at which
          URL, at what time. A claim without a timestamp and a URL is not a finding.
        </li>
        <li>
          <strong>Validated verdicts, not status codes.</strong> A URL that answers &ldquo;200
          OK&rdquo; with a login page is not an MCP endpoint; an llms.txt that returns an HTML error
          page is not an llms.txt. Every probe checks what actually came back.
        </li>
      </ol>

      <h2>A worked example: rung 3 in the wild</h2>
      <p>
        Firecrawl&apos;s keyless launch removed the last human step between an agent and its product
        — no signup, no API key, no card. An agent can discover it, call it, and use it, this
        afternoon. That is what Callable looks like as a commercial decision rather than a technical
        aspiration — done by a real company, this quarter, as customer acquisition.
      </p>

      <h2>Versioning</h2>
      <p>
        Scores are comparable only within a rubric version. This is v1.0.0; changes are logged here,
        and every scan records the version it was scored against.
      </p>
      <p className="muted">
        The first implementation of this rubric is the <a href="/">Agent Surface Scan</a> — which is
        itself agent-callable, because a rubric about callability that an agent cannot call would be
        embarrassing.
      </p>
    </main>
  );
}
