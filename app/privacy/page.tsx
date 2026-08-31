import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ScanWebMCP.com Privacy Notice",
  description: "What ScanWebMCP.com processes when scanning public websites and delivering reports.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <main className="wrap article editorial-page">
      <p className="kicker">Privacy</p>
      <h1>Privacy at ScanWebMCP.com</h1>
      <p>
        ScanWebMCP.com examines information that a website publishes to the open internet. A scan
        requests a small number of public pages, robots.txt, sitemap and discovery files, then stores
        bounded observations, source URLs, short evidence snippets, timestamps, scores, and the
        resulting recommendations. It does not sign in, bypass access controls, request private
        network addresses, or intentionally collect material behind an authentication wall.
      </p>
      <h2>Visitors and rate limiting</h2>
      <p>
        The service uses salted, non-reversible hashes derived from network information to apply
        shared abuse limits; raw IP addresses are not stored in the application database. Basic
        request metadata such as user agent may be recorded to distinguish human, agent, and service
        traffic and to diagnose failed scans. Hosted infrastructure may keep its own short-lived
        security and access logs under the provider&apos;s operational policies.
      </p>
      <h2>Email reports</h2>
      <p>
        An email address is collected only when a person asks for the full report. It is used to
        deliver that transactional report and unlock its evidence. Occasional benchmark updates are
        a separate, unchecked choice and remain disabled until the recipient explicitly opts in and
        confirms. Delivery attempts use stable idempotency controls so a retry does not intentionally
        send duplicate reports.
      </p>
      <h2>Public results and choices</h2>
      <p>
        The score, Ladder rung, dimension summary, domain, and scan time may be shown publicly. The
        detailed evidence remains gated by default. A verified domain controller can request
        correction or removal through the <a href="/contact">contact page</a> or the{" "}
        <a href="/opt-out">opt-out process</a>. Opted-out domains are excluded from future scans and
        comparison sets; only the minimum record needed to preserve the opt-out is retained.
      </p>
      <p>
        Questions about this notice or a data request can be sent to{" "}
        <a href="mailto:sara@nocodelab.ai">sara@nocodelab.ai</a>. Do not email credentials or
        sensitive report-access links. This notice describes the public ScanWebMCP.com service and
        should be read with <a href="/about-scanner">the scanner behavior page</a>.
      </p>
    </main>
  );
}
