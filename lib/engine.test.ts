import { describe, expect, it } from "vitest";
import {
  discoverPages,
  endpointsFromDiscovery,
  extractFormCapabilities,
  homepageTransportError,
  htmlToVisibleText,
  parseJsonRpcBody,
  parseRobots,
  robotsEvidenceSnippet,
  score,
  type Signal,
} from "./engine";

describe("homepage transport failures", () => {
  it("retries when both homepage identities fail before receiving HTTP", () => {
    expect(homepageTransportError(
      { status: 0, error: "fetch failed: Invalid IP address: undefined [ERR_INVALID_IP_ADDRESS]" },
      { status: 0, error: "fetch failed: Invalid IP address: undefined [ERR_INVALID_IP_ADDRESS]" },
    )).toContain("ERR_INVALID_IP_ADDRESS");
  });

  it("keeps real HTTP responses as scan evidence", () => {
    expect(homepageTransportError(
      { status: 403 },
      { status: 403 },
    )).toBeNull();
  });
});

describe("form capability extraction", () => {
  it("keeps a privacy-safe schema and classifies a quote form", () => {
    const capabilities = extractFormCapabilities([{
      url: "https://example.com/contact",
      html: `<form id="quote-request" action="/api/quote" method="post">
        <input type="hidden" name="csrf" value="secret">
        <input name="email" type="email" required value="person@example.com">
        <select name="service" required><option>Audit</option></select>
        <textarea name="requirements"></textarea>
        <button>Request a quote</button>
      </form>`,
    }]);

    expect(capabilities).toEqual([expect.objectContaining({
      purpose: "quote",
      action: "https://example.com/api/quote",
      method: "post",
      submitLabel: "Request a quote",
      fields: [
        { name: "email", type: "email", required: true },
        { name: "service", type: "select", required: true },
        { name: "requirements", type: "textarea", required: false },
      ],
    })]);
    expect(JSON.stringify(capabilities)).not.toContain("person@example.com");
    expect(JSON.stringify(capabilities)).not.toContain("csrf");
  });

  it("deduplicates a repeated footer form", () => {
    const html = `<form class="newsletter"><input name="email" type="email"><button>Subscribe</button></form>`;
    expect(extractFormCapabilities([
      { url: "https://example.com/", html },
      { url: "https://example.com/about", html },
    ])).toHaveLength(1);
  });
});

describe("visible HTML text", () => {
  it("removes script and style bodies with spaced closing tags", () => {
    const html = `
      <main>Useful content</main>
      <script>secretScriptText()</script\t\n ignored-attribute>
      <style>.secretStyleText { display: none }</style\t ignored-attribute>
    `;

    expect(htmlToVisibleText(html)).toBe("Useful content");
  });
});

describe("robots policy", () => {
  const policy = parseRobots(`
User-agent: *
Disallow: /private/
Allow: /private/public$

User-agent: AgentSurfaceScan
Disallow: /scanner-only
  `);

  it("uses the most specific user-agent group", () => {
    expect(policy.isAllowed("AgentSurfaceScan/0.1", "/private/secret")).toBe(true);
    expect(policy.isAllowed("AgentSurfaceScan/0.1", "/scanner-only")).toBe(false);
  });

  it("applies longest-rule and allow precedence", () => {
    expect(policy.isAllowed("SomeBot", "/private/secret")).toBe(false);
    expect(policy.isAllowed("SomeBot", "/private/public")).toBe(true);
  });

  it("treats user-agent lines separated by a blank line as separate groups", () => {
    const split = parseRobots("User-agent: *\n\nUser-agent: GPTBot\nDisallow: /");
    expect(split.isAllowed("SomeBot", "/")).toBe(true);
    expect(split.isAllowed("GPTBot", "/")).toBe(false);
  });

  it("stores the relevant user-agent group instead of a chopped file prefix", () => {
    const body = `# General crawlers
User-agent: *
Disallow: /private

# AI products share a deliberate policy
User-agent: GPTBot
User-agent: ClaudeBot
Allow: /
Disallow: /ops/`;
    expect(robotsEvidenceSnippet(body, "ClaudeBot")).toBe(
      "User-agent: GPTBot\nUser-agent: ClaudeBot\nAllow: /\nDisallow: /ops/",
    );
    expect(robotsEvidenceSnippet(body, "PerplexityBot")).toBe(
      "User-agent: *\nDisallow: /private",
    );
  });

  it("marks exceptionally long relevant evidence with an ellipsis", () => {
    const body = `User-agent: GPTBot\n${Array.from({ length: 40 }, (_, i) => `Disallow: /private-${i}`).join("\n")}`;
    const excerpt = robotsEvidenceSnippet(body, "GPTBot");
    expect(excerpt.length).toBeLessThanOrEqual(500);
    expect(excerpt.endsWith("…")).toBe(true);
  });
});

describe("same-origin discovery", () => {
  it("does not mistake a prefix-matching hostile origin for the target", () => {
    const pages = discoverPages(
      "https://example.com",
      `<a href="https://example.com.evil.test/pricing">bad</a><a href="/pricing">good</a>`,
    );
    expect(pages.get("pricing")).toBe("https://example.com/pricing");
  });

  it("only accepts same-origin endpoints from discovery JSON", () => {
    expect(endpointsFromDiscovery({ endpoint: "/mcp", backupUrl: "https://evil.test/mcp" }, "https://example.com"))
      .toEqual(["https://example.com/mcp"]);
  });
});

describe("callability evidence", () => {
  it("parses JSON-RPC from an SSE response", () => {
    expect(parseJsonRpcBody(`event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{}}\n\n`))
      .toMatchObject({ jsonrpc: "2.0", id: 1 });
  });

  it("does not award callability for a declared-only WebMCP manifest", () => {
    const now = new Date().toISOString();
    const signals: Signal[] = [
      { dimension: "D1", signalKey: "content_without_js", valueBool: true, evidenceUrl: "https://example.com", observedAt: now },
      { dimension: "D1", signalKey: "sitemap_xml", valueBool: true, evidenceUrl: "https://example.com/sitemap.xml", observedAt: now },
      { dimension: "D1", signalKey: "title_meta_coherence", valueBool: true, evidenceUrl: "https://example.com", observedAt: now },
      { dimension: "D3", signalKey: "webmcp_registration", valueBool: false, valueText: "manifest_declared_unverified", evidenceUrl: "https://example.com", observedAt: now },
      { dimension: "D3", signalKey: "webmcp_tools_declared", valueNum: 3, evidenceUrl: "https://example.com", observedAt: now },
    ];
    expect(score(signals).rung).not.toBe(3);
  });
});
