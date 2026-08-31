import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "404 — Resource not found",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <main className="wrap article editorial-page">
      <p className="kicker">HTTP 404</p>
      <h1>Resource not found</h1>
      <p>
        This path does not identify a published ScanWebMCP.com page or API resource. Agents and
        people can recover through the canonical indexes below.
      </p>
      <ul>
        <li><a href="/sitemap.xml">Sitemap</a> — indexable pages.</li>
        <li><a href="/llms.txt">llms.txt</a> — machine-readable site guide.</li>
        <li><a href="/developers">Developer portal</a> — API and MCP entry points.</li>
        <li><a href="/openapi.json">OpenAPI document</a> — typed REST operations.</li>
      </ul>
      <p><a href="/">Return to ScanWebMCP.com</a></p>
    </main>
  );
}
