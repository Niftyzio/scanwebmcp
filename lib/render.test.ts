import { describe, expect, it } from "vitest";
import {
  classifyWebMCPProbe,
  interpretRuntimeToolSnapshot,
  type WebMCPProbe,
} from "./render";

const probe = (partial: Partial<WebMCPProbe> = {}): WebMCPProbe => ({
  ok: true,
  activeToolNames: [],
  declaredToolNames: [],
  registrationCodeDetected: false,
  modelContextPresent: false,
  witnessAvailable: false,
  renderer: "playwright-remote",
  ...partial,
});

describe("WebMCP runtime evidence", () => {
  it("keeps a manifest unmeasured when the browser lacks a protocol witness", () => {
    expect(classifyWebMCPProbe(probe({ declaredToolNames: ["search_site"] }))).toEqual({
      verdict: "runtime_witness_unavailable_manifest_declared",
      valueBool: undefined,
    });
  });

  it("records a negative only when the protocol witness was available", () => {
    expect(classifyWebMCPProbe(probe({
      declaredToolNames: ["search_site"],
      witnessAvailable: true,
    }))).toEqual({
      verdict: "manifest_declared_unverified",
      valueBool: false,
    });
  });

  it("records witnessed live registrations as working", () => {
    expect(classifyWebMCPProbe(probe({
      activeToolNames: ["search_site"],
      witnessAvailable: true,
    }))).toEqual({
      verdict: "active_tools_found",
      valueBool: true,
    });
  });
});

describe("WebMCP runtime tool discovery", () => {
  it("accepts and deduplicates browser-reported tool names", () => {
    expect(interpretRuntimeToolSnapshot(JSON.stringify({
      available: true,
      names: ["search_site", "search_site", "book_appointment", 12],
    }))).toEqual({
      available: true,
      names: ["search_site", "book_appointment"],
    });
  });

  it("fails closed when the browser response is malformed", () => {
    expect(interpretRuntimeToolSnapshot("not-json")).toEqual({
      available: false,
      names: [],
    });
  });
});
