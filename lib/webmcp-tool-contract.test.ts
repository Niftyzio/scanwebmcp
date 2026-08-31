import { describe, expect, it } from "vitest";
import {
  boundedWebMCPText,
  normalizeWebMCPToolMetadata,
  truncateCharacters,
  WEBMCP_ANNOTATIONS,
  WEBMCP_CHARACTER_LIMITS,
} from "./webmcp-tool-contract";

describe("WebMCP tool contract", () => {
  it("bounds tool output without splitting Unicode characters", () => {
    const result = boundedWebMCPText(`Evidence ${"🔎".repeat(2_000)}`);

    expect(Array.from(result.content[0].text)).toHaveLength(WEBMCP_CHARACTER_LIMITS.output);
    expect(result.content[0].text).toContain("truncated to the WebMCP output budget");
    expect(result.content[0].text).not.toContain("\uFFFD");
  });

  it("leaves short outputs unchanged", () => {
    expect(boundedWebMCPText("Rung 3 — Callable").content[0].text).toBe("Rung 3 — Callable");
  });

  it("bounds tool and nested parameter descriptions without mutating the source", () => {
    const longDescription = "x".repeat(700);
    const longParameterDescription = "y".repeat(300);
    const source = {
      name: "get_evidence",
      description: longDescription,
      inputSchema: {
        type: "object",
        properties: {
          signal_key: { type: "string", description: longParameterDescription },
        },
      },
      annotations: WEBMCP_ANNOTATIONS.externalReadOnly,
    };

    const normalized = normalizeWebMCPToolMetadata(source);
    const parameter = (normalized.inputSchema as {
      properties: { signal_key: { description: string } };
    }).properties.signal_key;

    expect(Array.from(normalized.description)).toHaveLength(WEBMCP_CHARACTER_LIMITS.toolDescription);
    expect(Array.from(parameter.description)).toHaveLength(WEBMCP_CHARACTER_LIMITS.parameterDescription);
    expect(source.description).toBe(longDescription);
    expect(source.inputSchema.properties.signal_key.description).toBe(longParameterDescription);
  });

  it("rejects names outside Chrome's recommended budget", () => {
    expect(() => normalizeWebMCPToolMetadata({
      name: "x".repeat(WEBMCP_CHARACTER_LIMITS.toolName + 1),
      description: "Too long a name",
      inputSchema: {},
    })).toThrow(/exceeds 30 characters/);
  });

  it("publishes current safety hints for local, external, scan, and email tools", () => {
    expect(WEBMCP_ANNOTATIONS.localReadOnly).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
    expect(WEBMCP_ANNOTATIONS.externalReadOnly).toMatchObject({
      readOnlyHint: true,
      untrustedContentHint: true,
    });
    expect(WEBMCP_ANNOTATIONS.scan).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
      untrustedContentHint: true,
    });
    expect(WEBMCP_ANNOTATIONS.sendEmail).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    });
  });

  it("truncates a suffix to fit extremely small budgets", () => {
    expect(truncateCharacters("abcdef", 2, "long suffix")).toBe("lo");
  });
});
