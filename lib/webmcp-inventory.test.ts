import { describe, expect, it } from "vitest";
import {
  buildWebMCPInventory,
  classifyWebMCPTool,
  parseWebMCPInventory,
  serializeWebMCPInventory,
  summarizeWebMCPInventoryForAgent,
  type WebMCPToolDescriptor,
} from "./webmcp-inventory";

describe("WebMCP tool inventory", () => {
  it("classifies answer, action and sensitive action from observed descriptors", () => {
    expect(classifyWebMCPTool({ name: "search_catalog", annotations: { readOnlyHint: true } })).toBe("answer");
    expect(classifyWebMCPTool({ name: "get_cart", description: "Return the current cart" })).toBe("answer");
    expect(classifyWebMCPTool({ name: "add_to_cart", description: "Add a selected product" })).toBe("action");
    expect(classifyWebMCPTool({ name: "request_listing", inputSchema: { properties: { email: { type: "string" } } } })).toBe("sensitive_action");
  });

  it("unions route-scoped tools and retains the page that supplied each one", () => {
    const contexts = [
      { requestedUrl: "https://shop.example/", finalUrl: "https://shop.example/", toolCount: 3, toolNames: ["search", "categories", "cart"], witnessAvailable: true },
      { requestedUrl: "https://shop.example/products/router", finalUrl: "https://shop.example/products/router", toolCount: 1, toolNames: ["view_product"], witnessAvailable: true },
    ];
    const descriptors = new Map<string, WebMCPToolDescriptor[]>([
      [contexts[0].finalUrl, contexts[0].toolNames.map((name) => ({ name }))],
      [contexts[1].finalUrl, [{ name: "view_product", description: "Show a product" }]],
    ]);
    const inventory = buildWebMCPInventory(contexts, descriptors);
    expect(inventory.totalCount).toBe(4);
    expect(inventory.contextDependent).toBe(true);
    expect(inventory.tools.find((tool) => tool.name === "view_product")?.pageUrl).toBe(contexts[1].finalUrl);
  });

  it("round-trips a bounded structured inventory", () => {
    const context = { requestedUrl: "https://example.com/", finalUrl: "https://example.com/", toolCount: 1, toolNames: ["about"], witnessAvailable: true };
    const inventory = buildWebMCPInventory([context], new Map([[context.finalUrl, [{ name: "about", description: "About the site" }]]]));
    expect(parseWebMCPInventory(serializeWebMCPInventory(inventory))).toEqual(inventory);
  });

  it("summarizes page-aware tools, classifications, inputs and contract gaps", () => {
    const contexts = [
      { requestedUrl: "https://shop.example/", finalUrl: "https://shop.example/", toolCount: 1, toolNames: ["search_catalog"], witnessAvailable: true },
      { requestedUrl: "https://shop.example/products/router", finalUrl: "https://shop.example/products/router", toolCount: 1, toolNames: ["add_to_cart"], witnessAvailable: true },
    ];
    const inventory = buildWebMCPInventory(contexts, new Map([
      [contexts[0].finalUrl, [{
        name: "search_catalog",
        description: "Search products",
        inputSchema: { type: "object", properties: { query: { type: "string" } } },
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      }]],
      [contexts[1].finalUrl, [{ name: "add_to_cart", description: "Add a product to the cart" }]],
    ]));

    const summary = summarizeWebMCPInventoryForAgent("shop.example", inventory);

    expect(summary).toContain("2 distinct live WebMCP tools");
    expect(summary).toContain("surface changes by page");
    expect(summary).toContain("search_catalog [answer] on /");
    expect(summary).toContain("inputs query");
    expect(summary).toContain("add_to_cart [action] on /products/router");
    expect(summary).toContain("add_to_cart: input schema missing, annotations missing");
  });

  it("distinguishes a verified zero from an unmeasured registry", () => {
    const measured = buildWebMCPInventory([
      { requestedUrl: "https://example.com/", finalUrl: "https://example.com/", toolCount: 0, toolNames: [], witnessAvailable: true },
    ], new Map());
    const unmeasured = buildWebMCPInventory([
      { requestedUrl: "https://blocked.example/", finalUrl: "https://blocked.example/", toolCount: 0, toolNames: [], witnessAvailable: false },
    ], new Map(), ["https://cdn.example/webmcp.js"]);

    expect(summarizeWebMCPInventoryForAgent("example.com", measured)).toContain("0 live WebMCP tools were observed");
    expect(summarizeWebMCPInventoryForAgent("blocked.example", unmeasured)).toContain("absence is not proven");
  });
});
