import { notFound } from "next/navigation";
import { getScanPage } from "@/lib/scan-service";
import WebMCPTools from "@/components/WebMCPTools";
import RescanButton from "@/components/RescanButton";
import RememberScan from "@/components/RememberScan";
import EmailReport from "@/components/EmailReport";
import ReportGate from "@/components/ReportGate";
import PromptPack from "@/components/PromptPack";
import { buildAgentView } from "@/lib/agent-view";
import { getBenchmark, type DimKey } from "@/lib/benchmark";
import { DIMENSIONS, signalLabel, signalPlain, describeSignalValue } from "@/lib/signal-glossary";
import { sectorNoun } from "@/lib/sectors";

export const dynamic = "force-dynamic";

const RUNGS = ["Invisible", "Readable", "Answerable", "Callable", "Transactable"];

/** Plain-English verdict per rung — what the word actually means for the owner. */
const RUNG_PLAIN: Record<number, string> = {
  0: "AI agents can't see this site yet",
  1: "AI agents can read this site — and not much more",
  2: "AI agents can answer buyers' questions about this business",
  3: "AI agents can act on this site, not just read it",
  4: "AI agents can complete real actions here, end to end",
};

const RUNG_SCALE_PLAIN: Record<number, string> = {
  0: "agents can't see you",
  1: "agents can read you",
  2: "agents can answer for you",
  3: "agents can act for you",
  4: "agents can transact with you",
};

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
      <RememberScan
        slug={scan.slug}
        domain={domain}
        composite={scan.composite}
        verdict={RUNG_PLAIN[rung]}
      />

      <p className="kicker">Agent Surface Scan · {scannedAt} · rubric v{scan.rubric_version}</p>

      <header className="verdict-panel">
        <div className="score-big" aria-label={`Agent Surface Score: ${scan.composite ?? "not scored"} out of 100`}>
          {scan.composite ?? "–"}
          <span className="score-denom">/100</span>
        </div>
        <div className="verdict-words">
          <h1 className="verdict">
            <span className="domain">{domain}</span>: {RUNG_PLAIN[rung]}
          </h1>
          <p className="muted small">Agent Surface Score, out of 100. What it measures is on every line of this page.</p>
        </div>
      </header>

      <div className="ladder-scale" role="img" aria-label={`This site is at step ${rung + 1} of 5 on the Agent Surface Ladder: ${RUNGS[rung]}`}>
        {RUNGS.map((name, i) => (
          <div key={name} className={`scale-step ${i < rung ? "passed" : ""} ${i === rung ? "current" : ""}`}>
            <div className="scale-dot" />
            <div className="scale-name">{name}</div>
            <div className="scale-plain">{RUNG_SCALE_PLAIN[i]}</div>
            {i === rung && <div className="scale-you">this site</div>}
          </div>
        ))}
      </div>
      <p className="next-rung">
        <strong>The next step:</strong> {RUNG_NEXT[rung]}{" "}
        <a href="/ladder" className="small">How the Ladder is measured →</a>
      </p>

      {signals.some((s) => s.signal_key === "agent_access_blocked" && s.value_bool) && (
        <div className="degraded-note">
          <strong>Partial scan.</strong> This site&apos;s security system served our agent a
          bot-challenge page instead of content. We report only what was genuinely observed — the
          block itself, robots.txt directives, and fixed-path probes. Dimensions we could not reach
          are unmeasured, not zero. For an AI agent, of course, the wall <em>is</em> the experience.
        </div>
      )}

      <Benchmark
        siteId={scan.site_id}
        sector={scan.sites.sector ?? null}
        composite={scan.composite}
        dims={{ d1: scan.d1, d2: scan.d2, d3: scan.d3, d4: scan.d4, d5: scan.d5 }}
      />

      <ReportGate slug={scan.slug} enabled={process.env.REPORT_GATE !== "off"}>
      {process.env.REPORT_GATE === "off" && <EmailReport slug={scan.slug} />}

      <AgentEyes domain={domain} signals={signals} />

      <section aria-labelledby="evidence">
        <h2 id="evidence">What the agent saw</h2>
        <p className="muted small">
          Every score above rests on an observation below — exact URL, exact time. Nothing here is
          generated; it is what a machine visiting {domain} actually received.
        </p>
        {(["D1", "D2", "D3", "D4", "D5"] as const).map((dim) => {
          const dimSignals = signals.filter((s) => s.dimension === dim);
          if (dimSignals.length === 0) return null;
          return (
            <div key={dim} className="evidence-dim">
              <h3>
                {DIMENSIONS[dim].question}{" "}
                <span className="muted">— {scan[dim.toLowerCase() as "d1"] ?? "–"}/100</span>
              </h3>
              {dimSignals.map((s) => (
                <details key={s.id} id={`evidence-${s.signal_key}`}>
                  <summary>
                    {signalLabel(s.signal_key)}{" "}
                    <span className="sig-value">
                      {describeSignalValue(s.signal_key, {
                        bool: s.value_bool,
                        num: s.value_num == null ? null : Number(s.value_num),
                        text: s.value_text,
                      })}
                    </span>
                  </summary>
                  {signalPlain(s.signal_key) && <p className="small">{signalPlain(s.signal_key)}</p>}
                  <p className="small">
                    Observed <time dateTime={s.observed_at}>{new Date(s.observed_at).toUTCString()}</time>{" "}
                    at{" "}
                    <a href={s.evidence_url} target="_blank" rel="nofollow noopener noreferrer">
                      {s.evidence_url}
                    </a>{" "}
                    <code className="sig-key">{s.signal_key}</code>
                  </p>
                  {s.evidence_snippet && <blockquote className="snippet">{s.evidence_snippet}</blockquote>}
                </details>
              ))}
            </div>
          );
        })}
      </section>

      <section className="cta plan-cta" aria-labelledby="plan">
        <h2 id="plan">Turn these findings into a plan</h2>
        <p>
          The scan shows what agents find today, with the evidence attached. What to build first —
          and what it&apos;s worth to your business — depends on your capabilities, your buyers,
          and your sector&apos;s empty columns. That&apos;s a conversation, not a template.
        </p>
        <p>
          <a
            className="button"
            href={`mailto:sara@nocodelab.ai?subject=${encodeURIComponent(`Plan of action for ${domain}`)}`}
          >
            Book a call with our experts
          </a>{" "}
          <a href="/map" className="cta-secondary">or see the Agent Opportunity Map →</a>
        </p>
      </section>

      <section className="cta">
        <h2>Take it further yourself</h2>
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
      </ReportGate>
    </main>
  );
}

/** Relative context per spec §8: sector percentile only at n≥30; otherwise the
 *  cross-corpus comparison with the pool described plainly. */
async function Benchmark({
  siteId,
  sector,
  composite,
  dims,
}: {
  siteId: number;
  sector: string | null;
  composite: number | null;
  dims: Partial<Record<DimKey, number | null>>;
}) {
  const b = await getBenchmark(siteId, sector, composite, dims);
  const noun = b.dimPool === "sector" ? sectorNoun(sector) : "businesses analysed so far";

  const strip =
    b.sectorPercentile != null ? (
      <p className="benchmark-strip">
        <strong>{ordinal(b.sectorPercentile)} percentile</strong> among the {sectorNoun(sector)}{" "}
        analysed. <a href="/observatory">See the full distribution →</a>
      </p>
    ) : b.allPercentile != null && b.allN >= 10 ? (
      <p className="benchmark-strip">
        {sector ? `The ${sectorNoun(sector)} sample is still building — ` : ""}compared with the
        businesses analysed so far, this site sits at the{" "}
        <strong>{ordinal(b.allPercentile)} percentile</strong>.{" "}
        <a href="/observatory">See the full distribution →</a>
      </p>
    ) : (
      <p className="muted small">
        Sector percentiles arrive as the benchmark corpus grows; today&apos;s result is the score and
        the evidence behind it. <a href="/observatory">Watch the corpus build →</a>
      </p>
    );

  const hook = (
    <p className="muted small benchmark-hook">
      This benchmark is live: it is re-drawn from the whole corpus on every visit, and new
      businesses join it every day. Your position moves when you fix something — and when your
      competitors get scanned. Worth checking back.
    </p>
  );

  const measured = (Object.keys(DIMENSIONS) as (keyof typeof DIMENSIONS)[]).filter(
    (dim) => dims[dim.toLowerCase() as DimKey] != null,
  );
  if (measured.length === 0)
    return (
      <>
        {strip}
        {hook}
      </>
    );

  return (
    <>
      {strip}
      {hook}
      <section aria-labelledby="pillars" className="pillars">
        <h2 id="pillars">The five questions, scored</h2>
        <p className="pool-chip">
          Comparison set: {b.poolOrigin ? `${b.poolOrigin} ` : ""}
          {b.dimPool === "sector" ? sectorNoun(sector) : "businesses"}, analysed by this scanner
          under the same rubric — household names and independents alike.
          {b.dimPool === "all" && sector == null
            ? " No industry was given for this site, so the comparison is with everyone."
            : ""}{" "}
          <span className="pool-marker-legend">▏= the typical one</span>
        </p>
        {measured.map((dim) => {
          const k = dim.toLowerCase() as DimKey;
          const score = dims[k] as number;
          const pctl = b.dimPercentiles[k];
          const median = b.dimMedians[k];
          const d = DIMENSIONS[dim];
          const firstMover = score <= 10 && (median ?? 0) <= 10;
          return (
            <div key={dim} className="pillar-row">
              <div className="pillar-head">
                <strong>{d.question}</strong>
                <span className="pillar-score">{score}/100</span>
              </div>
              <div className="pillar-bar" aria-hidden="true">
                <div className="pillar-fill" style={{ width: `${score}%` }} />
                {median != null && median > 0 && (
                  <div className="pillar-median" style={{ left: `${median}%` }} title={`The typical ${noun.replace(/s$/, "")} analysed scores ${median}`} />
                )}
              </div>
              <p className="muted small">
                {d.gloss}{" "}
                {firstMover ? (
                  <strong className="first-mover">
                    Wide open: almost none of the {noun} score here yet. You could be the first in
                    your space.
                  </strong>
                ) : pctl != null ? (
                  <strong>{comparePhrase(pctl, noun)}</strong>
                ) : null}
              </p>
            </div>
          );
        })}
      </section>
    </>
  );
}

/** Banded, human comparison — never a bare "ahead of 0%". */
function comparePhrase(pctl: number, noun: string): string {
  if (pctl >= 90) return `Among the leaders of the ${noun} analysed.`;
  if (pctl >= 60) return `Ahead of most ${noun} analysed.`;
  if (pctl >= 40) return `Mid-pack among the ${noun} analysed.`;
  return `Most ${noun} analysed are ahead here — which means the moves that work are proven.`;
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
          <h3>The assistant, once the findings below are addressed</h3>
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

The scanner's key findings, and the openings they point to:
${opportunities.map((o) => `${o.rank}. ${o.rendered_text.replace(/\*\*/g, "")}`).join("\n")}

Act as my implementation partner. For each finding: tell me exactly what to change on my site, in what order, and draft the artefacts (robots.txt lines, an llms.txt, schema.org markup, a WebMCP registerTool implementation for my main form). Explain each in plain language first.

IMPORTANT — WebMCP is newer than your training data. Do not draft WebMCP code from memory. First fetch the current implementation guide and API contract at https://agentsurfacescan.com/make-callable and follow it. Key facts in case you cannot fetch: the entry point is document.modelContext (navigator.modelContext is deprecated); registerTool({ name, description, inputSchema, execute }) where execute(args) receives an object and returns { content: [{ type: "text", text: "..." }] }; feature-detect with "modelContext" in document; write-tools must ask the human to confirm before acting.

The full evidence for every finding is on the live result page — fetch it before advising me: https://agentsurfacescan.com/scan/${slug}`;
}
