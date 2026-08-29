"use client";

import { useEffect, useState } from "react";

const UNLOCK_KEY = "agent-scan-unlocked";

/**
 * The unlock: the verdict, ladder, and scores above stay open as the teaser;
 * the full report below (findings, evidence, the buyer's-agent scene) reveals
 * for an email. One email unlocks this browser for good, and the report is
 * also sent to the inbox. Agents are never gated — the page's WebMCP tools
 * sit outside this wrapper. Disable entirely with REPORT_GATE=off.
 */
export default function ReportGate({
  slug,
  enabled,
  children,
}: {
  slug: string;
  enabled: boolean;
  children: React.ReactNode;
}) {
  const [unlocked, setUnlocked] = useState<boolean | null>(enabled ? null : true);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "error">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!enabled) return;
    try {
      setUnlocked(localStorage.getItem(UNLOCK_KEY) === "yes");
    } catch {
      setUnlocked(false);
    }
  }, [enabled]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setError("");
    try {
      const res = await fetch("/api/report-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, slug }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Something went wrong — try again.");
      try {
        localStorage.setItem(UNLOCK_KEY, "yes");
      } catch {
        /* private window: unlock still applies for this page view */
      }
      setUnlocked(true);
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Something went wrong — try again.");
    }
  }

  if (unlocked) return <>{children}</>;

  return (
    <div className="report-gate">
      <div className="gate-blur" aria-hidden="true">
        {children}
      </div>
      <div className="gate-panel" role="region" aria-label="Unlock the full report">
        <h2>Your full report is ready</h2>
        <p>
          Every finding with its evidence, what a buyer&apos;s AI assistant says about you today,
          and exactly where to start. Unlock it with your email — we&apos;ll send you the report
          too, and let you know when your benchmark position moves.
        </p>
        <form onSubmit={submit} aria-busy={state === "sending"}>
          <input
            type="email"
            placeholder="you@yourbusiness.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={state === "sending"}
            aria-label="Email address to unlock your report"
            required
          />
          <button type="submit" disabled={state === "sending"}>
            {state === "sending" ? "Unlocking…" : "Unlock my report"}
          </button>
        </form>
        <p className="muted small">Occasional benchmark updates included. Unsubscribe any time.</p>
        {state === "error" && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
