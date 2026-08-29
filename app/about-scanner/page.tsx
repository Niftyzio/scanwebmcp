import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "How the scanner behaves",
  description: "What the Agent Surface Scan fetches, how it identifies itself, and how to opt out.",
};

export default function AboutScanner() {
  return (
    <main className="wrap article">
      <h1>How the scanner behaves</h1>
      <p>
        The Agent Surface Scan reads a site the way an AI agent would, and only that: public pages,
        plain HTTP requests, no authentication, nothing bypassed.
      </p>
      <ul>
        <li>
          <strong>Identification:</strong> requests carry the user agent{" "}
          <code>AgentSurfaceScan/0.1 (+https://agentsurfacescan.com/about-scanner)</code>.
        </li>
        <li><strong>Volume:</strong> at most six pages per scan, one scan per domain per 24 hours unless a re-scan is requested, 10-second timeouts.</li>
        <li><strong>Respect:</strong> robots.txt honoured for our user agent; private and internal addresses refused; no rate that could resemble an attack.</li>
        <li><strong>Storage:</strong> observed public signals with evidence snippets capped at 500 characters. Nothing behind a login is ever requested or stored. Lawful basis: legitimate interest in analysing publicly published business information.</li>
        <li><strong>Corrections:</strong> every result page carries the exact evidence for each finding. If something is wrong, use the contact route below — corrections are logged and the page re-issued with a visible timestamp.</li>
      </ul>
      <h2>Opting out</h2>
      <p>
        <a href="/opt-out">Request removal here</a>. Opted-out domains are excluded from future
        scans and any comparison sets; we retain only a tombstone record of the opt-out itself.
      </p>
    </main>
  );
}
