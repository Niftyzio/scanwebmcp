import { describe, expect, it } from "vitest";
import {
  browserlessCDPEndpoint,
  classifyWebMCPProbe,
  interpretRuntimeToolSnapshot,
  remoteBrowserProtocol,
  withWebMCPLaunchOptions,
  type WebMCPProbe,
} from "./render";

const probe = (partial: Partial<WebMCPProbe> = {}): WebMCPProbe => ({
  ok: true,
  activeToolNames: [],
  declaredToolNames: [],
  registrationCodeDetected: false,
  modelContextPresent: false,
  protocolDomainAvailable: false,
  runtimeRegistryAvailable: false,
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

  it("records a negative only when a runtime witness was available", () => {
    expect(classifyWebMCPProbe(probe({
      declaredToolNames: ["search_site"],
      witnessAvailable: true,
    }))).toEqual({
      verdict: "manifest_declared_unverified",
      valueBool: false,
    });
  });

  it("does not mistake an enabled CDP domain for a working runtime witness", () => {
    expect(classifyWebMCPProbe(probe({
      declaredToolNames: ["search_site"],
      protocolDomainAvailable: true,
      runtimeRegistryAvailable: false,
      witnessAvailable: false,
    }))).toEqual({
      verdict: "runtime_witness_unavailable_manifest_declared",
      valueBool: undefined,
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

describe("remote browser transport", () => {
  it("converts Browserless native Chromium endpoints to CDP", () => {
    const endpoint = new URL(browserlessCDPEndpoint(
      "wss://production-lon.browserless.io/chromium/playwright?token=secret&launch=%7B%7D",
    ));
    expect(endpoint.pathname).toBe("/chromium");
    expect(endpoint.searchParams.get("token")).toBe("secret");
    expect(endpoint.searchParams.get("launch")).toBe("{}");
    expect(remoteBrowserProtocol(endpoint.toString())).toBe("cdp");
  });

  it("converts the shorthand native endpoint and preserves CDP endpoints", () => {
    expect(new URL(browserlessCDPEndpoint(
      "wss://production-lon.browserless.io/playwright?token=secret",
    )).pathname).toBe("/chromium");
    expect(new URL(browserlessCDPEndpoint(
      "wss://production-lon.browserless.io/chrome?token=secret",
    )).pathname).toBe("/chrome");
  });

  it("does not rewrite non-Chromium native endpoints", () => {
    expect(new URL(browserlessCDPEndpoint(
      "wss://production-lon.browserless.io/firefox/playwright?token=secret",
    )).pathname).toBe("/firefox/playwright");
  });

  it("uses CDP for Browserless root and chromium endpoints", () => {
    expect(remoteBrowserProtocol("wss://production-lon.browserless.io?token=secret")).toBe("cdp");
    expect(remoteBrowserProtocol("wss://production-lon.browserless.io/chromium?token=secret")).toBe("cdp");
  });

  it("uses the native protocol only for Playwright endpoints", () => {
    expect(remoteBrowserProtocol("wss://production-lon.browserless.io/chromium/playwright?token=secret")).toBe("playwright");
    expect(remoteBrowserProtocol("wss://production-lon.browserless.io/playwright/?token=secret")).toBe("playwright");
  });

  it("adds the Browserless-compatible WebMCP feature switch", () => {
    const endpoint = new URL(withWebMCPLaunchOptions(
      "wss://production-lon.browserless.io/chromium/playwright?token=secret",
    ));
    expect(JSON.parse(endpoint.searchParams.get("launch") ?? "{}")).toEqual({
      args: ["--enable-features=WebMCP"],
    });
    expect(endpoint.searchParams.get("token")).toBe("secret");
  });

  it("merges an existing launch payload and removes the unsupported WebMCP blink switch", () => {
    const launch = encodeURIComponent(JSON.stringify({
      headless: true,
      args: ["--lang=en-GB", "--enable-features=Existing", "--enable-blink-features=WebMCP,Other"],
    }));
    const endpoint = new URL(withWebMCPLaunchOptions(
      `wss://production-lon.browserless.io/chromium/playwright?token=secret&launch=${launch}`,
    ));
    expect(JSON.parse(endpoint.searchParams.get("launch") ?? "{}")).toEqual({
      headless: true,
      args: [
        "--lang=en-GB",
        "--enable-blink-features=Other",
        "--enable-features=Existing,WebMCP",
      ],
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
