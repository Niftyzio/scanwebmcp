import { notFound } from "next/navigation";
import { getScanPage } from "@/lib/scan-service";
import WebMCPTools from "@/components/WebMCPTools";
import RescanButton from "@/components/RescanButton";

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
      <p className="muted small">
        Sector percentiles arrive with the benchmark corpus; today&apos;s result is the rung and the
        evidence behind it.
      </p>

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
          Copy this into your own AI assistant, or open this page in ChatGPT&apos;s desktop browser
          and ask it to walk you through the findings — this page registers tools it can call.
        </p>
        <RescanButton domain={domain} />
      </section>
    </main>
  );
}

/** Render our own `**bold** — text` template strings as React nodes — no HTML injection. */
function renderOpp(md: string): React.ReactNode {
  return md.split(/\*\*/).map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part));
}
