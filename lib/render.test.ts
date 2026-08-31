import { describe, expect, it } from "vitest";
import {
  browserlessCDPEndpoint,
  classifyWebMCPProbe,
  interpretRuntimeToolSnapshot,
  isPotentialWebMCPRuntimeUrl,
  isWebMCPProbeRequestAllowed,
  pollRuntimeToolRegistry,
  remoteBrowserProtocol,
  shouldRetryUnmeasuredRemoteProbe,
  withWebMCPLaunchOptions,
  type WebMCPProbe,
} from "./render";
import { buildWebMCPInventory } from "./webmcp-inventory";

const probe = (partial: Partial<WebMCPProbe> = {}): WebMCPProbe => ({
  ok: true,
  activeToolNames: [],
  declaredToolNames: [],
  registrationCodeDetected: false,
  modelContextPresent: false,
  protocolDomainAvailable: false,
  runtimeRegistryAvailable: false,
  witnessAvailable: false,
  inventory: buildWebMCPInventory([], new Map()),
  blockedRuntimeUrls: [],
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

  it("does not turn a blocked WebMCP runtime into a false zero", () => {
    expect(classifyWebMCPProbe(probe({
      blockedRuntimeUrls: ["https://static.example/webmcp/runtime.js"],
    }))).toEqual({
      verdict: "runtime_dependency_blocked",
      valueBool: undefined,
    });
  });
});

describe("remote browser transport", () => {
  it("retries only an unmeasured, unblocked remote witness", () => {
    expect(shouldRetryUnmeasuredRemoteProbe(probe())).toBe(true);
    expect(shouldRetryUnmeasuredRemoteProbe(probe({ witnessAvailable: true }))).toBe(false);
    expect(shouldRetryUnmeasuredRemoteProbe(probe({
      blockedRuntimeUrls: ["https://cdn.example/webmcp.js"],
    }))).toBe(false);
    expect(shouldRetryUnmeasuredRemoteProbe(probe({ renderer: "playwright" }))).toBe(false);
    expect(shouldRetryUnmeasuredRemoteProbe(probe({ ok: false }))).toBe(false);
  });

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
      totalCount: 2,
      tools: [{ name: "search_site" }, { name: "book_appointment" }],
    });
  });

  it("fails closed when the browser response is malformed", () => {
    expect(interpretRuntimeToolSnapshot("not-json")).toEqual({
      available: false,
      names: [],
      totalCount: 0,
      tools: [],
    });
  });

  it("waits for the complete registry instead of keeping the first non-empty batch", async () => {
    const five = ["about", "request_listing", "share_on_x", "share_on_linkedin", "record_unsupported_request"];
    const six = [...five, "surprise_me"];
    const snapshots = [five, five, six, six, six, six, six, six];
    let reads = 0;
    const waits: number[] = [];

    const result = await pollRuntimeToolRegistry(
      async () => JSON.stringify({ available: true, names: snapshots[reads++] }),
      async (milliseconds) => { waits.push(milliseconds); },
    );

    expect(result).toEqual({
      available: true,
      names: six,
      totalCount: 6,
      tools: six.map((name) => ({ name })),
    });
    expect(reads).toBe(8);
    expect(waits).toEqual(Array(7).fill(500));
  });

  it("does not truncate a registry at 25 tools", () => {
    const tools = Array.from({ length: 40 }, (_, index) => ({
      name: `tool_${index + 1}`,
      description: `Tool ${index + 1}`,
    }));
    const snapshot = interpretRuntimeToolSnapshot(JSON.stringify({ available: true, totalCount: 40, tools }));
    expect(snapshot.totalCount).toBe(40);
    expect(snapshot.tools).toHaveLength(40);
    expect(snapshot.names.at(-1)).toBe("tool_40");
  });
});

describe("WebMCP renderer request policy", () => {
  const origin = "https://www.awaytravel.com";

  it("allows the audited Shopify WebMCP runtime scripts", () => {
    expect(isWebMCPProbeRequestAllowed(
      "https://cdn.shopify.com/storefront/webmcp/webmcp-0.1.1.js",
      origin,
      "Script",
    )).toBe(true);
    expect(isWebMCPProbeRequestAllowed(
      "https://cdn.shopify.com/storefront/standard-actions.js",
      origin,
      "script",
    )).toBe(true);
    expect(isWebMCPProbeRequestAllowed(
      "https://cdn.shopify.com/shopifycloud/storefront/assets/storefront/origin_trials-5059b83f.js",
      origin,
      "Script",
    )).toBe(true);
  });

  it("continues to block arbitrary and private cross-origin requests", () => {
    expect(isWebMCPProbeRequestAllowed("https://evil.example/tool.js", origin, "Script")).toBe(false);
    expect(isWebMCPProbeRequestAllowed("http://169.254.169.254/latest/meta-data", origin, "Script")).toBe(false);
    expect(isWebMCPProbeRequestAllowed("https://cdn.shopify.com/extensions/unrelated.js", origin, "Script")).toBe(false);
    expect(isWebMCPProbeRequestAllowed(
      "https://cdn.shopify.com/storefront/webmcp/webmcp-0.1.1.js",
      origin,
      "Fetch",
    )).toBe(false);
  });

  it("allows all resources from the already validated target origin", () => {
    expect(isWebMCPProbeRequestAllowed(`${origin}/assets/app.js`, origin, "Script")).toBe(true);
    expect(isWebMCPProbeRequestAllowed(`${origin}/api/catalog`, origin, "Fetch")).toBe(true);
  });

  it("recognises cross-origin WebMCP-looking scripts without treating arbitrary scripts as runtimes", () => {
    expect(isPotentialWebMCPRuntimeUrl("https://static.example/webmcp/runtime.js?token=secret", "script")).toBe(true);
    expect(isPotentialWebMCPRuntimeUrl("https://static.example/assets/app.js", "script")).toBe(false);
    expect(isPotentialWebMCPRuntimeUrl("https://static.example/webmcp/runtime.js", "fetch")).toBe(false);
  });
});
