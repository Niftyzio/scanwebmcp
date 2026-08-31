import { describe, expect, it } from "vitest";
import { isPotentialWebMCPRuntimeUrl, isWebMCPProbeRequestAllowed } from "./render";
import { discoverWebMCPContexts } from "./webmcp-contexts";
import { buildWebMCPInventory, type WebMCPToolDescriptor } from "./webmcp-inventory";

describe("known WebMCP platform regressions", () => {
  it("keeps Shopify's runtime and linked commerce contexts measurable", () => {
    const origin = "https://shop.example";
    const html = `<meta name="generator" content="Shopify">
      <a href="/collections/bags">Bags</a><a href="/products/carry-on">Carry-on</a><a href="/cart">Cart</a>`;
    expect(discoverWebMCPContexts(origin, html)).toHaveLength(4);
    expect(isWebMCPProbeRequestAllowed(
      "https://cdn.shopify.com/storefront/webmcp/webmcp-0.1.1.js",
      origin,
      "script",
    )).toBe(true);
  });

  it("allows same-origin Cloudflare-hosted assets and flags a separate WebMCP runtime for hardened retrieval", () => {
    const origin = "https://agent-shop.pages.dev";
    expect(isWebMCPProbeRequestAllowed(`${origin}/assets/runtime.js`, origin, "script")).toBe(true);
    expect(isPotentialWebMCPRuntimeUrl("https://static.example.net/webmcp/runtime.js", "script")).toBe(true);
  });

  it("preserves Render-style names exactly while storing readable descriptors", () => {
    const url = "https://render.com/";
    const descriptors: WebMCPToolDescriptor[] = [
      { name: "render.docs.search", description: "Search Render documentation" },
      { name: "render.docs.get-markdown", description: "Read a documentation page" },
      { name: "render.llms.get-index", description: "Browse the AI index" },
      { name: "render.blog.get-index", description: "Browse the blog" },
      { name: "render.articles.get-index", description: "Browse articles" },
    ];
    const context = { requestedUrl: url, finalUrl: url, toolCount: 5, toolNames: descriptors.map((tool) => tool.name), witnessAvailable: true };
    const inventory = buildWebMCPInventory([context], new Map([[url, descriptors]]));
    expect(inventory.totalCount).toBe(5);
    expect(inventory.tools.map((tool) => tool.name)).toEqual(descriptors.map((tool) => tool.name));
  });

  it("unions an independent multi-page site without a six- or 25-tool ceiling", () => {
    const pages = ["/", "/questions", "/mcp", "/proof"].map((path) => `https://independent.example${path}`);
    const descriptors = new Map<string, WebMCPToolDescriptor[]>();
    const contexts = pages.map((url, pageIndex) => {
      const tools = Array.from({ length: pageIndex === 0 ? 38 : pageIndex === 1 ? 6 : pageIndex === 2 ? 2 : 5 }, (_, index) => ({
        name: `page_${pageIndex}_tool_${index}`,
      }));
      descriptors.set(url, tools);
      return { requestedUrl: url, finalUrl: url, toolCount: tools.length, toolNames: tools.map((tool) => tool.name), witnessAvailable: true };
    });
    expect(buildWebMCPInventory(contexts, descriptors).totalCount).toBe(51);
  });
});
