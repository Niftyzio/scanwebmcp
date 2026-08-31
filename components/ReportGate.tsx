"use client";

import { memo, useState } from "react";

const ReportPreview = memo(function ReportPreview({ domain, score }: { domain: string; score: number | null }) {
  return <div className="report-preview" aria-hidden="true">
    <div className="preview-report-head">
      <div>
        <span>ScanWebMCP.com Report · {domain}</span>
        <strong>Full evidence and recommendations</strong>
      </div>
      <b>{score ?? "–"}<span>/100</span></b>
    </div>
    <div className="preview-report-grid">
      <div className="preview-report-main">
        <span className="preview-label">Five questions, scored</span>
        {[72, 54, 31, 18, 45].map((width, index) => (
          <div className="preview-metric" key={width}>
            <div><i>{`0${index + 1}`}</i><span /></div>
            <em><span style={{ width: `${width}%` }} /></em>
          </div>
        ))}
      </div>
      <div className="preview-report-side">
        <span className="preview-label">Priority moves</span>
        {["01", "02", "03"].map((number) => (
          <div className="preview-priority" key={number}>
            <i>{number}</i><span><b /><b /></span>
          </div>
        ))}
      </div>
    </div>
    <div className="preview-evidence">
      <span className="preview-label">Observed evidence</span>
      <div /><div /><div />
    </div>
  </div>;
});

/**
 * The server does not render or serialize the full findings until a signed
 * report-access cookie exists. This component only captures the email that
 * creates that access and then reloads the server-rendered page.
 */
export default function ReportGate({ slug, domain, score }: { slug: string; domain: string; score: number | null }) {
  const [email, setEmail] = useState("");
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "opening" | "error">("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setError("");
    try {
      const res = await fetch("/api/report-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, slug, marketingConsent }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Something went wrong — try again.");
      setState("opening");
      location.reload();
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Something went wrong — try again.");
    }
  }

  return (
    <div className="report-gate">
      <ReportPreview domain={domain} score={score} />

      <div className="gate-panel" role="region" aria-label="Unlock the full report">
        <p className="gate-eyebrow">Your private evidence report</p>
        <h2>Your full report is ready</h2>
        <p>
          Your score and ladder position stay public. Enter your email to unlock every finding,
          its observed evidence, what a buyer&apos;s AI assistant sees, and the recommended next
          steps. We&apos;ll send you a private link to the same report too.
        </p>
        <form onSubmit={submit} aria-busy={state === "sending" || state === "opening"}>
          <input
            type="email"
            placeholder="you@yourbusiness.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={state === "sending" || state === "opening"}
            aria-label="Email address to unlock your report"
            required
          />
          <button type="submit" disabled={state === "sending" || state === "opening"}>
            <span>{state === "sending" ? "Sending…" : state === "opening" ? "Opening…" : "Unlock my report"}</span>
            <span aria-hidden="true">→</span>
          </button>
        </form>
        <label className="consent-row small">
          <input
            type="checkbox"
            checked={marketingConsent}
            onChange={(event) => setMarketingConsent(event.target.checked)}
            disabled={state === "sending" || state === "opening"}
          />
          Email me occasional benchmark updates too (optional; confirmation required).
        </label>
        <p className="gate-trust"><span aria-hidden="true">✓</span> Immediate access · A private link sent to your inbox</p>
        {state === "error" && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
