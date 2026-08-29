import { notFound } from "next/navigation";
import { getScanPage } from "@/lib/scan-service";
import WebMCPTools from "@/components/WebMCPTools";
import RescanButton from "@/components/RescanButton";
import PromptPack from "@/components/PromptPack";
import { buildAgentView } from "@/lib/agent-view";
import { getBenchmark } from "@/lib/benchmark";

export const dynamic = "force-dynamic";

const RUNGS = ["Invisible", "Readable", "Answerable", "Callable", "Transactable"];
const RUNG_NEXT: Record<number, string> = {
  0: "Readable — an agent can retrieve and understand what you do. Usually one robots.txt edit or a server-rendered summary away.",
  1: "Answerable — an agent can answer a buyer's real questions: offering, price band, availability. Publish the answers agents are already being asked for.",
  2: "Callable — one capability an agent can invoke: an MCP endpoint, a documented API, or a registered WebMCP tool.",
  3: "Transactable — an agent completes a meaningful action end to end, with human confirmation rather than human labour.",
  4: "You're at the top of the current ladder. The next move is breadth: more capabilities exposed, and attestation.",
};

export default async function ScanPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await getScanPage(slug);
  if (!page) notFound();
  const { scan, signals, opportunities } = page;
  const domain: string = scan.sites.domain;

  if (scan.status !== "complete") {
    return (
      <main className="wrap">
        <h1>Scan of {domain}</h1>
        <p>
          {scan.status === "failed"
            ? `This scan could not complete${scan.error ? `: ${scan.error}` : "."}`
            : "Scan in progress — refresh in a few seconds."}
        </p>
      </main>
    );
  }

  const rung: number = scan.rung ?? 0;
  const scanData = {
    scanId: scan.id,
    domain,
    slug: scan.slug,
    rung,
    rungName: RUNGS[rung],
    scores: { d1: scan.d1, d2: scan.d2, d3: scan.d3, d4: scan.d4, d5: scan.d5, composite: scan.composite },
    opportunities: opportunities.map((o) => ({
      rank: o.rank,
      text: o.rendered_text,
      impact: o.impact,
      ease: o.ease,
    })),
    signals: signals.map((s) => ({
      dimension: s.dimension,
      key: s.signal_key,
      value: s.value_bool ?? s.value_num ?? s.value_text,
      detail: s.value_text,
      evidenceUrl: s.evidence_url,
      evidenceSnippet: s.evidence_snippet,
      observedAt: s.observed_at,
    })),
  };

  const scannedAt = new Date(scan.completed_at).toUTCString();

  return (
    <main className="wrap">
      <WebMCPTools mode="scan" scan={scanData} />

      <p className="kicker">Agent Surface Scan · {scannedAt} · rubric v{scan.rubric_version}</p>
      <h1 className="verdict">
        <span className="domain">{domain}</span> is <strong>{RUNGS[rung]}</strong>
        <span className="muted"> — rung {rung} of 4 on the Agent Surface Ladder</span>
      </h1>
      {signals.some((s) => s.signal_key === "agent_access_blocked" && s.value_bool) && (
        <div className="degraded-note">
          <strong>Partial scan.</strong> This site&apos;s security system served our agent a
          bot-challenge page instead of content. We report only what was genuinely observed — the
          block itself, robots.txt directives, and fixed-path probes. Dimensions we could not reach
          are unmeasured, not zero. For an AI agent, of course, the wall <em>is</em> the experience.
        </div>
      )}
      <Benchmark siteId={scan.site_id} sector={scan.sites.sector ?? null} composite={scan.composite} />

      <AgentEyes domain={domain} signals={signals} />

      <section aria-labelledby="opps">
        <h2 id="opps">The three opportunities most worth taking</h2>
        <ol className="opportunities">
          {opportunities.map((o) => (
            <li key={o.rank} id={`opportunity-${o.rank}`}>
              <p>{renderOpp(o.rendered_text)}</p>
              <p className="muted small">
                impact {o.impact}/5 · ease {o.ease}/5
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="ladder">
        <h2 id="ladder">Where this sits</h2>
        <ol className="ladder">
          {RUNGS.map((name, i) => (
            <li key={name} className={i === rung ? "current" : i < rung ? "passed" : ""}>
              <span className="rung-num">{i}</span> {name}
              {i === rung && <span className="you"> ← this site</span>}
            </li>
          ))}
        </ol>
        <p>
          <strong>The next rung:</strong> {RUNG_NEXT[rung]}
        </p>
        <p className="small">
          <a href="/ladder">How the Ladder is measured — definitions, weights, method →</a>
        </p>
      </section>

      <section aria-labelledby="evidence">
        <h2 id="evidence">What the agent saw</h2>
        <p className="muted small">
          Every finding above rests on an observation below — exact URL, exact time. Nothing here is
          generated; it is what a machine visiting {domain} actually received.
        </p>
        {(["D1", "D2", "D3", "D4", "D5"] as const).map((dim) => {
          const dimSignals = signals.filter((s) => s.dimension === dim);
          if (dimSignals.length === 0) return null;
          const dimNames = {
            D1: "Legibility",
            D2: "Answerability",
            D3: "Callability",
            D4: "Transactability",
            D5: "Standing",
          };
          return (
            <div key={dim} className="evidence-dim">
              <h3>
                {dim} · {dimNames[dim]} — {scan[dim.toLowerCase() as "d1"] ?? "–"}/100
              </h3>
              {dimSignals.map((s) => (
                <details key={s.id} id={`evidence-${s.signal_key}`}>
                  <summary>
                    <code>{s.signal_key}</code>{" "}
                    <span className="sig-value">
                      {String(s.value_bool ?? s.value_num ?? s.value_text ?? "")}
                    </span>
                  </summary>
                  <p className="small">
                    {s.value_text && s.value_bool == null && s.value_num != null ? `${s.value_text} · ` : ""}
                    Observed <time dateTime={s.observed_at}>{new Date(s.observed_at).toUTCString()}</time>{" "}
                    at <a href={s.evidence_url} rel="nofollow noopener">{s.evidence_url}</a>
                  </p>
                  {s.evidence_snippet && <blockquote className="snippet">{s.evidence_snippet}</blockquote>}
                </details>
              ))}
            </div>
          );
        })}
      </section>

      <section className="cta">
        <h2>Take it further</h2>
        <p>
          Take these findings to your own AI assistant — the prompt below carries them, the
          evidence URLs, and the current WebMCP API contract (so your AI drafts against
          today&apos;s spec, not its training data). Or open this page in ChatGPT&apos;s desktop
          browser and ask it to walk you through the findings: this page registers tools it can
          call. Ready to build? <a href="/make-callable">The implementation guide</a> has the
          copy-paste starting point.
        </p>
        <PromptPack prompt={buildPrompt(domain, RUNGS[rung], scan.rubric_version, opportunities, slug)} />
        <p style={{ marginTop: "1rem" }}>
          <RescanButton domain={domain} />
        </p>
      </section>
    </main>
  );
}

/** Render our own `**bold** — text` template strings as React nodes — no HTML injection. */
function renderOpp(md: string): React.ReactNode {
  return md.split(/\*\*/).map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part));
}

/** Relative context per spec §8: sector percentile only at n≥30; otherwise the
 *  cross-corpus comparison with the sample size stated plainly. */
async function Benchmark({
  siteId,
  sector,
  composite,
}: {
  siteId: number;
  sector: string | null;
  composite: number | null;
}) {
  const b = await getBenchmark(siteId, sector, composite);
  if (b.sectorPercentile != null) {
    return (
      <p className="benchmark-strip">
        <strong>{ordinal(b.sectorPercentile)} percentile</strong> among {b.sectorN} {b.sectorName}{" "}
        sites scanned. <a href="/observatory">See the full distribution →</a>
      </p>
    );
  }
  if (b.allPercentile != null && b.allN >= 10) {
    return (
      <p className="benchmark-strip">
        {sector ? `The ${sector} sample is still building — ` : ""}compared with all{" "}
        <strong>{b.allN} businesses</strong> scanned so far, this site sits at the{" "}
        <strong>{ordinal(b.allPercentile)} percentile</strong>.{" "}
        <a href="/observatory">See the full distribution →</a>
      </p>
    );
  }
  return (
    <p className="muted small">
      Sector percentiles arrive as the benchmark corpus grows; today&apos;s result is the rung and
      the evidence behind it. <a href="/observatory">Watch the corpus build →</a>
    </p>
  );
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/** The buyer's-agent scene — signals translated into the conversation the owner will actually meet. */
function AgentEyes({
  domain,
  signals,
}: {
  domain: string;
  signals: { signal_key: string; value_bool: boolean | null; value_num: number | null; value_text: string | null }[];
}) {
  const view = buildAgentView(domain, signals);
  return (
    <section aria-labelledby="agent-eyes" className="agent-eyes">
      <h2 id="agent-eyes">Through a buyer&apos;s agent&apos;s eyes</h2>
      <p className="muted small">
        This is not a metaphor. Assistants are asked questions like this every day; every line below
        rests on a signal in the evidence section.
      </p>
      <p className="buyer-ask">
        <span className="speaker">A buyer, to their AI assistant:</span> &ldquo;{view.buyerAsk}&rdquo;
      </p>
      <div className="dialogue-grid">
        <div className="dialogue today">
          <h3>The assistant, today</h3>
          {view.today.map((l, i) => (
            <p key={i} className={l.ok === false ? "line bad" : l.ok ? "line good" : "line"}>
              <span aria-hidden="true">{l.ok === false ? "✗" : l.ok ? "✓" : "·"}</span> {l.text}{" "}
              {l.signalKey && (
                <a className="evidence-link" href={`#evidence-${l.signalKey}`} title="See the evidence">
                  evidence
                </a>
              )}
            </p>
          ))}
        </div>
        <div className="dialogue future">
          <h3>The assistant, after the three opportunities below</h3>
          {view.withTools.map((l, i) => (
            <p key={i} className={l.ok ? "line good" : "line"}>
              <span aria-hidden="true">{l.ok ? "✓" : "·"}</span> {l.text}
            </p>
          ))}
        </div>
      </div>
    </section>
  );
}

function buildPrompt(
  domain: string,
  rungName: string,
  rubricVersion: string,
  opportunities: { rank: number; rendered_text: string }[],
  slug: string,
): string {
  return `My website ${domain} was scanned with the Agent Surface Scan (Agent Surface Ladder v${rubricVersion}, by Sara Simeone / Agentic Sara). Verdict: ${rungName} on the ladder Invisible → Readable → Answerable → Callable → Transactable.

The three evidenced opportunities, ranked by impact × ease:
${opportunities.map((o) => `${o.rank}. ${o.rendered_text.replace(/\*\*/g, "")}`).join("\n")}

Act as my implementation partner. For each opportunity: tell me exactly what to change on my site, in what order, and draft the artefacts (robots.txt lines, an llms.txt, schema.org markup, a WebMCP registerTool implementation for my main form). Explain each in plain language first.

IMPORTANT — WebMCP is newer than your training data. Do not draft WebMCP code from memory. First fetch the current implementation guide and API contract at https://agentsurfacescan.com/make-callable and follow it. Key facts in case you cannot fetch: the entry point is document.modelContext (navigator.modelContext is deprecated); registerTool({ name, description, inputSchema, execute }) where execute(args) receives an object and returns { content: [{ type: "text", text: "..." }] }; feature-detect with "modelContext" in document; write-tools must ask the human to confirm before acting.

The full evidence for every finding is on the live result page — fetch it before advising me: https://agentsurfacescan.com/scan/${slug}`;
}
