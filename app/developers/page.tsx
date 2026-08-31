import type { Metadata } from "next";
import { siteUrl } from "@/lib/site";

export const metadata: Metadata = {
  title: "ScanWebMCP.com Developer API",
  description: "Public REST, OpenAPI, MCP, and agent-skill documentation for ScanWebMCP.com.",
  alternates: {
    canonical: "/developers",
    types: { "text/plain": "/developers/llms.txt", "text/markdown": "/agents.md" },
  },
};

const SCAN_EXAMPLE = `curl -X POST https://www.scanwebmcp.com/api/scan \\
  -H "Content-Type: application/json" \\
  -d '{"url":"example.com","requester":"agent"}'`;

const RESULT_EXAMPLE = `{
  "slug": "example.com",
  "status": "complete",
  "cached": true,
  "cachedAt": "2026-08-31T12:00:00.000Z",
  "freshScanAvailableAt": "2026-09-01T12:00:00.000Z"
}`;

export default function DevelopersPage() {
  return (
    <main className="wrap article editorial-page editorial-guide">
      <p className="kicker">Developers · public API · no key required</p>
      <h1>Build with the ScanWebMCP.com API</h1>
      <p className="lede">
        Request a public website scan, read its Agent Surface Ladder result, or query aggregate
        Observatory data through a typed REST API. The same core capabilities are also available
        over MCP. Access is free and self-serve: there is no account, API key, OAuth flow, or
        contact-sales gate.
      </p>

      <h2>Start with the machine-readable contract</h2>
      <p>
        The canonical <a href="/openapi.json">OpenAPI 3.1 document</a> defines every public
        operation, request body, response schema, error, and example. Discovery clients can also
        use the <a href="/.well-known/api-catalog">RFC 9727 API catalog</a>, the{" "}
        <a href="/.well-known/ard.json">ARD catalog</a>, or the scoped{" "}
        <a href="/developers/llms.txt">developer llms.txt</a>.
      </p>

      <h2>Quickstart: scan a safe example domain</h2>
      <p>
        The public sandbox is the production API used with IANA&apos;s reserved <code>example.com</code>
        domain. It exercises validation, caching, schemas, and result retrieval without targeting a
        third-party business. Automated clients should set <code>requester</code> to <code>agent</code>.
      </p>
      <pre className="snippet code-block">{SCAN_EXAMPLE}</pre>
      <p>The response points to a stable result slug:</p>
      <pre className="snippet code-block">{RESULT_EXAMPLE}</pre>
      <p>
        Fetch <code>GET /api/scan/example.com</code> to read the public rung, the five dimension
        scores, the rubric version, and the completion timestamp. When <code>locked</code> is true,
        the exact signals and recommendations are intentionally omitted until the human requests
        the free emailed report.
      </p>

      <h2>Public operations</h2>
      <ul>
        <li><code>POST /api/scan</code> — start a scan or reuse a sufficiently recent result.</li>
        <li><code>GET /api/scan/&#123;slug&#125;</code> — read the public result summary.</li>
        <li><code>GET /api/observatory</code> — read aggregate corpus and sector counts.</li>
        <li><code>POST /mcp</code> — use the same product through Streamable HTTP MCP.</li>
      </ul>

      <h2>Limits, caching, and errors</h2>
      <p>
        A scan makes several polite requests to the target website, so callers are limited to ten
        scan requests per connection per hour. Automated traffic may receive a result cached for up
        to 24 hours; the response says when that happened and when a fresh scan becomes available.
        Errors use JSON with a stable <code>code</code>, a <code>message</code>, and a concrete{" "}
        <code>resolution</code>. Handle <code>400</code>, <code>404</code>, <code>429</code>,{" "}
        <code>500</code>, and <code>503</code> according to the OpenAPI contract.
      </p>

      <h2>MCP and agent skill</h2>
      <p>
        MCP clients can connect to <code>{siteUrl("/mcp")}</code> without authentication. Preview
        the tools in the <a href="/.well-known/mcp/server-card.json">MCP server card</a>. Agents
        that prefer an instruction artifact can install or read the{" "}
        <a href="/skills/scan-webmcp/SKILL.md">ScanWebMCP skill</a>, whose digest is published in
        the <a href="/.well-known/agent-skills/index.json">Agent Skills index</a>.
      </p>

      <h2>Responsible use</h2>
      <p>
        Scan only public websites relevant to the user&apos;s request. The service refuses private and
        internal network targets, follows redirects defensively, honours robots.txt, and never
        authenticates to the target. See <a href="/auth.md">authentication and report-delivery
        rules</a>, <a href="/about-scanner">scanner behavior</a>, and the{" "}
        <a href="/privacy">privacy notice</a> before building a high-volume integration.
      </p>
    </main>
  );
}
