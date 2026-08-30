"use client";

import { useState } from "react";

/** Not a gate — the results stay open. The email buys delivery and the
 *  come-back alert, and starts the list with domain-tagged leads. */
export default function EmailReport({ slug }: { slug: string }) {
  const [email, setEmail] = useState("");
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
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
      setState("done");
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Something went wrong — try again.");
    }
  }

  if (state === "done") {
    return (
      <p className="email-report done">
        Done — this report was sent or queued for delivery. If you requested benchmark updates,
        they remain off until you confirm through the separate link in the email.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="email-report" aria-busy={state === "sending"}>
      <p className="email-report-lede">
        <strong>Keep this report.</strong> Get the evidenced result in your inbox.
      </p>
      <div className="email-report-row">
        <input
          type="email"
          placeholder="you@yourbusiness.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={state === "sending"}
          aria-label="Email address for your report"
          required
        />
        <button type="submit" disabled={state === "sending"}>
          {state === "sending" ? "Sending…" : "Email me this report"}
        </button>
      </div>
      <label className="consent-row small">
        <input
          type="checkbox"
          checked={marketingConsent}
          onChange={(event) => setMarketingConsent(event.target.checked)}
          disabled={state === "sending"}
        />
        Email me occasional benchmark updates too (optional; confirmation required).
      </label>
      {state === "error" && <p className="error">{error}</p>}
    </form>
  );
}
