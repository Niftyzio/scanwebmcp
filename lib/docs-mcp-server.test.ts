import { describe, expect, it } from "vitest";
import { handleDocsMcpRequest } from "./docs-mcp-server";
import { SITE_ORIGIN } from "./site";

async function rpc(method: string, params?: Record<string, unknown>) {
  const response = handleDocsMcpRequest({ jsonrpc: "2.0", id: 1, method, params });
  return response.json();
}

describe("documentation MCP server", () => {
  it("advertises two annotated read-only tools", async () => {
    const body = await rpc("tools/list");
    expect(body.result.tools.map((tool: { name: string }) => tool.name)).toEqual([
      "search_scanwebmcp_docs",
      "get_scanwebmcp_guide",
    ]);
    expect(body.result.tools.every((tool: { annotations: { readOnlyHint: boolean } }) =>
      tool.annotations.readOnlyHint,
    )).toBe(true);
  });

  it("returns sourced documentation search results", async () => {
    const body = await rpc("tools/call", {
      name: "search_scanwebmcp_docs",
      arguments: { query: "API authentication" },
    });
    expect(body.result.isError).not.toBe(true);
    expect(body.result.content[0].text).toContain(`${SITE_ORIGIN}/`);
    expect(body.result.structuredContent.results.length).toBeGreaterThan(0);
  });

  it("returns structured tool errors", async () => {
    const body = await rpc("tools/call", { name: "missing", arguments: {} });
    expect(body.result.isError).toBe(true);
    expect(body.result.structuredContent.error.code).toBe("UNKNOWN_TOOL");
  });
});
