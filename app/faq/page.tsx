import type { Metadata } from "next";
import WebMCPTools from "@/components/WebMCPTools";

export const metadata: Metadata = {
  title: "FAQ — ScanWebMCP.com",
  description: "Direct answers about the scan, the Ladder, what we store, and how agents call this site.",
};

const FAQS: [string, string][] = [
  [
    "What does ScanWebMCP.com actually do?",
    "It reads your website the way an AI agent would — public pages, plain requests, no login — and reports where you sit on the Agent Surface Ladder: Invisible, Readable, Answerable, Callable or Transactable. Every finding carries the exact URL, timestamp and observed evidence behind it.",
  ],
  [
    "Is it really free? What's the catch?",
    "Free, permanently, with no account or password. Your score, rung and dimension summary stay public; the full evidence and recommendations unlock after you ask to receive the report by email. The scan is how we build the benchmark corpus and how businesses discover the paid Agent Opportunity Map. Benchmark updates are a separate optional opt-in.",
  ],
  [
    "Is there any AI inside the scanner?",
    "No. The scan is deterministic code: fetches, pattern checks, arithmetic. That's deliberate — evidence beats generation, results are reproducible, and no one's AI tokens are spent. AI enters only when you choose it: your own assistant reading the results, or an agent calling our tools.",
  ],
  [
    "What do you store about my site?",
    "Observed public signals only — what a visiting machine could see anyway — with evidence snippets capped at 500 characters. Nothing behind a login is ever requested. Full conduct rules, including our declared user agent and volume limits, are on the How we scan page, and you can opt out at any time.",
  ],
  [
    "Is the scan right for every kind of website?",
    "The rubric measures businesses that sell products or services to buyers — firms whose customers ask questions, enquire, book or order. Media, government and reference sites sit outside its scope by design: questions like discoverable pricing or an FAQ don't apply to a newspaper, so their scores read as out-of-scope, not as verdicts. If demand grows in a sector, we benchmark it properly rather than force-fit the rubric.",
  ],
  [
    "My score seems wrong. What do I do?",
    "Request the free full report from your result page, then open its evidence section — every claim shows exactly what was observed and when. If the evidence itself is wrong, email sara@nocodelab.ai; corrections are logged and the page re-issued with a visible timestamp. If your site's firewall blocked our scanner, the page says so plainly rather than guessing.",
  ],
  [
    "How do I improve my rung?",
    "In order: let AI crawlers read you (robots.txt), publish an llms.txt and machine-readable markup, put real answers on your site — services, prices or price bands, FAQs — then expose one capability as a callable tool. The Make it callable guide has the copy-paste starting point; the fastest movers go from Invisible to Readable in an afternoon.",
  ],
  [
    "Why does nobody score Transactable?",
    "Because verifying it means actually completing an action on your site — booking, ordering, submitting — which we will not do uninvited. The automated scan assesses up to Callable; Transactable is verified through a consented invocation test.",
  ],
  [
    "Can my AI assistant use this site directly?",
    "Yes, two ways. In an agent-capable browser, this site registers WebMCP tools; any MCP-compatible app can also discover the endpoint through /.well-known/mcp. An assistant can run a scan and read the public summary directly. If you directly request the report and supply an address, it can email it; otherwise it must ask whether you want delivery and which address to use.",
  ],
  [
    "How often does the scoring change?",
    "The rubric is refined quarterly against the benchmark corpus. Every scan records the rubric version it was scored under, so comparisons are always like-for-like.",
  ],
  [
    "Who is behind this?",
    "Sara Simeone (Agentic Sara), author of the Agent Surface Ladder. The scanner's source code is open source under AGPL-3.0. The Ladder's authored rubric text is separately © 2026 Sara Simeone, all rights reserved; the hosted benchmark corpus is not part of the repository's AGPL grant.",
  ],
];

const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map(([q, a]) => ({
    "@type": "Question",
    name: q,
    acceptedAnswer: { "@type": "Answer", text: a },
  })),
};

export default function FaqPage() {
  return (
    <main className="wrap article editorial-page editorial-faq">
      <WebMCPTools mode="site" />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />
      <p className="kicker">Direct answers — the same courtesy we score everyone else on</p>
      <h1>Questions, answered</h1>
      {FAQS.map(([q, a]) => (
        <section key={q}>
          <h2>{q}</h2>
          <p>{a}</p>
        </section>
      ))}
      <section className="cta">
        <h2>Still wondering where you stand?</h2>
        <p><a className="button" href="/">Run your scan</a></p>
      </section>
    </main>
  );
}
