import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  AGENT_SKILLS_INDEX,
  API_CATALOG,
  ARD_CATALOG,
  MCP_SERVER_CARD,
  OPENAPI_DOCUMENT,
} from "./agent-discovery";

describe("agent discovery documents", () => {
  it("publishes self-describing OpenAPI operations with unique IDs", () => {
    const operations = Object.values(OPENAPI_DOCUMENT.paths).flatMap((path) =>
      Object.values(path),
    );
    const operationIds = operations.map((operation) => operation.operationId);

    expect(operationIds).toHaveLength(new Set(operationIds).size);
    expect(operations.every((operation) => operation.description.length > 20)).toBe(true);
    expect(operations.every((operation) => operation.security.length === 0)).toBe(true);
  });

  it("publishes valid, domain-anchored ARD entries", () => {
    expect(ARD_CATALOG.entries.length).toBeGreaterThanOrEqual(3);
    for (const entry of ARD_CATALOG.entries) {
      expect(entry.identifier).toMatch(/^urn:air:scanwebmcp\.com:/);
      expect(entry.displayName).toBeTruthy();
      expect(entry.type).toContain("/");
      expect(new URL(entry.url).hostname).toBe("www.scanwebmcp.com");
    }
  });

  it("keeps the advertised skill digest aligned with its bytes", async () => {
    const [skill, pluginSkill] = await Promise.all([
      readFile("public/skills/scan-webmcp/SKILL.md"),
      readFile("skills/scan-webmcp/SKILL.md"),
    ]);
    const digest = `sha256:${createHash("sha256").update(skill).digest("hex")}`;
    expect(pluginSkill.equals(skill)).toBe(true);
    expect(AGENT_SKILLS_INDEX.skills[0].digest).toBe(digest);
  });

  it("links the API catalog and MCP card to live product surfaces", () => {
    expect(API_CATALOG.linkset[0].item.some((item) => item.href.endsWith("/api/scan"))).toBe(true);
    expect(MCP_SERVER_CARD.serverUrl).toBe("https://www.scanwebmcp.com/mcp");
    expect(MCP_SERVER_CARD.tools.map((tool) => tool.name)).toEqual([
      "scan_agent_surface",
      "get_ladder_definition",
      "email_report",
      "get_observatory_stats",
    ]);
  });
});
