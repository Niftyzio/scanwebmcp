import { describe, expect, it } from "vitest";
import {
  discoverPages,
  endpointsFromDiscovery,
  parseJsonRpcBody,
  parseRobots,
  score,
  type Signal,
} from "./engine";

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
