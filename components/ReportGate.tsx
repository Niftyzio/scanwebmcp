"use client";

import { useState } from "react";

/**
 * The server does not render or serialize the full findings until a signed
 * report-access cookie exists. This component only captures the email that
 * creates that access and then reloads the server-rendered page.
 */
export default function ReportGate({ slug }: { slug: string }) {
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
      <div className="gate-panel" role="region" aria-label="Unlock the full report">
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
            {state === "sending" ? "Sending…" : state === "opening" ? "Opening…" : "Email and unlock my report"}
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
        {state === "error" && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
