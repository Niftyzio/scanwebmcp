/**
 * Renderer interface — spec §10: the renderer stays behind an interface, and
 * plain-HTTP paths must always be able to complete a scan without it.
 *
 * One job only: the D3 WebMCP probe, which needs a rendered DOM. Failures are
 * recorded, never fatal — a scan without a render says "not checked", not
 * "absent".
 *
 * Renderer chain (first success wins):
 *  1. Local Playwright — a renderer we own (spec §10: steps that are ours must
 *     always be able to complete a scan alone), and the strongest detector:
 *     its Chromium carries Chrome's WebMCP runtime feature, so it observes
 *     real registrations via the WebMCP CDP domain. No rate limits, no cost.
 *     Loaded dynamically, so deploys without the package (e.g. Vercel
 *     serverless, which cannot run Chromium) fall through to Firecrawl.
 *  2. Firecrawl — keyed when FIRECRAWL_API_KEY is set (real rate limits),
 *     keyless otherwise (anonymous tier, 429s under repeated use). The only
 *     renderer available in serverless production; detects via the manifest
 *     convention and code patterns, not live registrations.
 *
 * Detection tiers, strongest first:
 *  1. observed  — WebMCP CDP domain reports the page's actual registerTool
 *                 calls against a live modelContext (Playwright path only)
 *  2. manifest  — window.__webmcpToolManifest / <html data-webmcp-tools>,
 *                 the detectability convention we publish at /make-callable
 *  3. code      — registerTool call patterns in the rendered document's markup
 */

import { SCANNER_UA } from "./engine";
import { resolvePublicHost, safeFetchText } from "./safe-http";
import {
  buildWebMCPInventory,
  normalizeWebMCPTools,
  type WebMCPContextObservation,
  type WebMCPInventory,
  type WebMCPToolDescriptor,
} from "./webmcp-inventory";

export interface WebMCPProbe {
  ok: boolean;
  /** Registrations witnessed by the browser protocol. This is callability evidence. */
  activeToolNames: string[];
  /** Names advertised in a page convention. Useful discovery, not proof of callability. */
  declaredToolNames: string[];
  registrationCodeDetected: boolean;
  modelContextPresent: boolean;
  /** The CDP domain accepted WebMCP.enable. This is diagnostic only: a remote
   * browser can expose the domain without exposing a working page runtime. */
  protocolDomainAvailable: boolean;
  /** True when document.modelContext.getTools() could query the live registry. */
  runtimeRegistryAvailable: boolean;
  /** True only when the live registry was queryable or registrations were
   * actually emitted. A rendered page without either is unmeasured. */
  witnessAvailable: boolean;
  inventory: WebMCPInventory;
  /** Sanitized public script URLs that looked WebMCP-related but could not be
   * loaded inside the hardened renderer. This makes an incomplete runtime an
   * unmeasured result rather than a false zero. */
  blockedRuntimeUrls: string[];
  renderer?: "firecrawl" | "playwright" | "playwright-remote";
  remoteProtocol?: "cdp" | "playwright";
  browserVersion?: string;
  error?: string;
}

// The entry point is mid-migration in the wild: Chrome's origin trial exposes
// both document.modelContext and navigator.modelContext — detect either.
const PROBE_SCRIPT = `JSON.stringify({
  present: typeof document.modelContext !== "undefined" || typeof navigator.modelContext !== "undefined",
  manifest: Array.isArray(window.__webmcpToolManifest) ? window.__webmcpToolManifest.slice(0, 25) : null,
  dataAttr: document.documentElement.dataset.webmcpTools || null
})`;

// CDP events can be missed by some remote-browser transports even when the
// page registered its tools. getTools() reads Chromium's live registry and is
// therefore a second runtime witness, not a page-authored declaration.
const RUNTIME_TOOLS_SCRIPT = `(async () => {
  try {
    const context = document.modelContext || navigator.modelContext;
    if (!context || typeof context.getTools !== "function") {
      return JSON.stringify({ available: false, totalCount: 0, tools: [] });
    }
    const tools = await context.getTools();
    const list = Array.from(tools || []);
    return JSON.stringify({
      available: true,
      totalCount: list.length,
      tools: list.map((tool) => ({
        name: tool && tool.name,
        description: tool && tool.description,
        inputSchema: tool && tool.inputSchema,
        annotations: tool && tool.annotations,
      })),
    });
  } catch (error) {
    return JSON.stringify({ available: false, totalCount: 0, tools: [], error: String(error) });
  }
})()`;

/**
 * Keep the rendered probe behind a strict network boundary without breaking
 * platform-provided WebMCP runtimes. Most third-party traffic remains blocked;
 * only audited, script-only bootstrap paths are allowed across origins.
 *
 * Shopify injects its WebMCP adapter from cdn.shopify.com on every supported
 * storefront. Blocking that script leaves document.modelContext available but
 * its registry empty, which is indistinguishable from a site with no tools.
 */
export function isWebMCPProbeRequestAllowed(
  requestUrl: string,
  targetOrigin: string,
  resourceType?: string,
): boolean {
  if (/^(data|blob|about):/i.test(requestUrl)) return true;
  try {
    const request = new URL(requestUrl);
    if (request.origin === targetOrigin) return true;
    if (request.protocol !== "https:" || resourceType?.toLowerCase() !== "script") return false;

    if (request.hostname.toLowerCase() !== "cdn.shopify.com") return false;
    return request.pathname.startsWith("/storefront/webmcp/")
      || request.pathname === "/storefront/standard-actions.js"
      || /^\/shopifycloud\/storefront\/assets\/storefront\/origin_trials-[a-z0-9._-]+\.js$/i.test(request.pathname);
  } catch {
    return false;
  }
}

export function interpretRuntimeToolSnapshot(raw: unknown): {
  available: boolean;
  names: string[];
  totalCount: number;
  tools: WebMCPToolDescriptor[];
} {
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!parsed || typeof parsed !== "object") return { available: false, names: [], totalCount: 0, tools: [] };
    const snapshot = parsed as { available?: unknown; names?: unknown; totalCount?: unknown; tools?: unknown };
    const tools = normalizeWebMCPTools(snapshot.tools);
    const names = tools.length > 0
      ? tools.map((tool) => tool.name)
      : Array.isArray(snapshot.names)
        ? [...new Set(snapshot.names.filter((name): name is string => typeof name === "string" && name.length > 0))]
        : [];
    return {
      available: snapshot.available === true,
      names,
      totalCount: typeof snapshot.totalCount === "number" && Number.isFinite(snapshot.totalCount)
        ? Math.max(snapshot.totalCount, names.length)
        : names.length,
      tools: tools.length > 0 ? tools : names.map((name) => ({ name })),
    };
  } catch {
    return { available: false, names: [], totalCount: 0, tools: [] };
  }
}

/** Read through the full bounded settle window. A non-empty registry is not
 * necessarily complete: sites may register tools across multiple tasks or
 * bundles. Returning the last queryable snapshot avoids saving the first
 * partial batch as the final tool count. */
export async function pollRuntimeToolRegistry(
  readSnapshot: () => Promise<unknown>,
  wait: (milliseconds: number) => Promise<void>,
  attempts = 8,
): Promise<{ available: boolean; names: string[]; totalCount: number; tools: WebMCPToolDescriptor[] }> {
  let latest = { available: false, names: [] as string[], totalCount: 0, tools: [] as WebMCPToolDescriptor[] };
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const current = interpretRuntimeToolSnapshot(
      await readSnapshot().catch(() => undefined),
    );
    if (current.available) latest = current;
    if (attempt < attempts - 1) await wait(500);
  }
  return latest;
}

function probeFailure(error: string, renderer?: WebMCPProbe["renderer"]): WebMCPProbe {
  const inventory = buildWebMCPInventory([], new Map());
  return {
    ok: false,
    activeToolNames: [],
    declaredToolNames: [],
    registrationCodeDetected: false,
    modelContextPresent: false,
    protocolDomainAvailable: false,
    runtimeRegistryAvailable: false,
    witnessAvailable: false,
    inventory,
    blockedRuntimeUrls: [],
    renderer,
    error,
  };
}

/** Interpret a probe-script return value plus rendered HTML into a verdict. */
function interpretProbe(
  raw: unknown,
  html: string,
  renderer: NonNullable<WebMCPProbe["renderer"]>,
): WebMCPProbe {
  let present = false;
  let declaredToolNames: string[] = [];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as { present?: boolean; manifest?: string[] | null; dataAttr?: string | null };
      present = !!parsed.present;
      if (Array.isArray(parsed.manifest)) declaredToolNames = parsed.manifest.map(String);
      else if (parsed.dataAttr) declaredToolNames = parsed.dataAttr.split(",").map((s) => s.trim()).filter(Boolean);
    } catch {
      /* unparseable return — fall through to code detection */
    }
  }
  const registrationCodeDetected =
    /modelContext\s*\.\s*registerTool|registerTool\s*\(\s*\{|__webmcpToolManifest|data-webmcp-tools/.test(html);

  return {
    ok: true,
    activeToolNames: [],
    declaredToolNames,
    registrationCodeDetected,
    modelContextPresent: present,
    protocolDomainAvailable: false,
    runtimeRegistryAvailable: false,
    witnessAvailable: false,
    inventory: buildWebMCPInventory([], new Map()),
    blockedRuntimeUrls: [],
    renderer,
  };
}

export function classifyWebMCPProbe(probe: WebMCPProbe): {
  verdict: string;
  valueBool: boolean | undefined;
} {
  if (!probe.ok) {
    return {
      verdict: `render_unavailable:${probe.error ?? "unknown"}`,
      valueBool: undefined,
    };
  }
  if (probe.activeToolNames.length > 0) {
    return { verdict: "active_tools_found", valueBool: true };
  }
  if (!probe.witnessAvailable) {
    return {
      verdict: probe.blockedRuntimeUrls.length > 0
        ? "runtime_dependency_blocked"
        : probe.declaredToolNames.length > 0
        ? "runtime_witness_unavailable_manifest_declared"
        : probe.registrationCodeDetected
          ? "runtime_witness_unavailable_code_detected"
          : "runtime_witness_unavailable",
      valueBool: undefined,
    };
  }
  if (probe.declaredToolNames.length > 0) {
    return { verdict: "manifest_declared_unverified", valueBool: false };
  }
  if (probe.registrationCodeDetected) {
    return { verdict: "registration_code_unverified", valueBool: false };
  }
  return { verdict: "none_detected", valueBool: false };
}

async function probeViaFirecrawl(url: string): Promise<WebMCPProbe> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.FIRECRAWL_API_KEY
          ? { Authorization: `Bearer ${process.env.FIRECRAWL_API_KEY}` }
          : {}),
      },
      signal: controller.signal,
      body: JSON.stringify({
        url,
        formats: ["html"],
        actions: [
          { type: "wait", milliseconds: 2500 },
          { type: "executeJavascript", script: PROBE_SCRIPT },
        ],
      }),
    });
    clearTimeout(timer);
    if (!res.ok) return probeFailure(`firecrawl_http_${res.status}`, "firecrawl");

    const j = (await res.json()) as {
      success?: boolean;
      data?: { html?: string; actions?: { javascriptReturns?: { type: string; value: unknown }[] } };
    };
    if (!j.success) return probeFailure("firecrawl_unsuccessful", "firecrawl");

    return interpretProbe(j.data?.actions?.javascriptReturns?.[0]?.value, j.data?.html ?? "", "firecrawl");
  } catch (e) {
    return probeFailure(e instanceof Error ? e.message : String(e), "firecrawl");
  }
}

// Browserless allows --enable-features on every plan. Its unrestricted flag
// set (including --enable-blink-features) is Enterprise-only, and mixing an
// unsupported flag into launch.args can leave the whole hosted session without
// WebMCP. This base-feature switch also works for our local Chromium probe.
const WEBMCP_LAUNCH_ARGS = ["--enable-features=WebMCP"];

/** Browserless uses CDP at its root/chromium endpoints and the native
 * Playwright protocol only at paths ending in /playwright. */
export function remoteBrowserProtocol(endpoint: string): "cdp" | "playwright" {
  try {
    return /(?:^|\/)playwright\/?$/i.test(new URL(endpoint).pathname)
      ? "playwright"
      : "cdp";
  } catch {
    return "cdp";
  }
}

/**
 * Browserless exposes Chromium through two different transports. WebMCP's
 * launch-level feature switch is reliably applied by the CDP endpoint, while
 * the native Playwright endpoint can expose the WebMCP protocol domain without
 * making document.modelContext available to the page. Prefer CDP for Chromium
 * but leave non-Chromium Playwright endpoints untouched.
 */
export function browserlessCDPEndpoint(base: string): string {
  try {
    const endpoint = new URL(base);
    const path = endpoint.pathname.replace(/\/+$/, "");
    if (/^\/(?:chromium|chrome)\/playwright$/i.test(path)) {
      endpoint.pathname = path.replace(/\/playwright$/i, "");
    } else if (/^\/playwright$/i.test(path)) {
      endpoint.pathname = "/chromium";
    }
    return endpoint.toString();
  } catch {
    return base;
  }
}

/**
 * Remote browser endpoint (e.g. Browserless) for serverless deploys that
 * cannot run Chromium. The env var holds the full wss:// URL including the
 * token; the WebMCP launch flag is appended unless the URL already sets one.
 */
export function withWebMCPLaunchOptions(base: string): string {
  try {
    const endpoint = new URL(base);
    const encodedLaunch = endpoint.searchParams.get("launch");
    let launch: Record<string, unknown> = {};
    if (encodedLaunch) {
      try {
        launch = JSON.parse(encodedLaunch) as Record<string, unknown>;
      } catch {
        // Browserless also accepts base64-encoded launch JSON.
        launch = JSON.parse(Buffer.from(encodedLaunch, "base64").toString("utf8")) as Record<string, unknown>;
      }
    }

    const existingArgs = Array.isArray(launch.args)
      ? launch.args.filter((arg): arg is string => typeof arg === "string")
      : [];
    const compatibleArgs: string[] = [];
    let baseFeatures: string[] = [];
    for (const arg of existingArgs) {
      if (arg.startsWith("--enable-features=")) {
        baseFeatures.push(...arg.slice("--enable-features=".length).split(",").filter(Boolean));
        continue;
      }
      if (arg.startsWith("--enable-blink-features=")) {
        const remaining = arg
          .slice("--enable-blink-features=".length)
          .split(",")
          .filter((feature) => feature && feature !== "WebMCP");
        if (remaining.length > 0) compatibleArgs.push(`--enable-blink-features=${remaining.join(",")}`);
        continue;
      }
      compatibleArgs.push(arg);
    }
    baseFeatures = [...new Set([...baseFeatures, "WebMCP"])];
    compatibleArgs.push(`--enable-features=${baseFeatures.join(",")}`);
    endpoint.searchParams.set("launch", JSON.stringify({ ...launch, args: compatibleArgs }));
    return endpoint.toString();
  } catch {
    // Never replace a configured endpoint if its launch payload cannot be
    // understood; the renderer will report the runtime as unavailable.
    return base;
  }
}

function remoteBrowserEndpoint(): string | undefined {
  const base = process.env.BROWSER_WS_ENDPOINT;
  return base ? withWebMCPLaunchOptions(browserlessCDPEndpoint(base)) : undefined;
}

export function isPotentialWebMCPRuntimeUrl(requestUrl: string, resourceType?: string): boolean {
  if (resourceType?.toLowerCase() !== "script") return false;
  try {
    const url = new URL(requestUrl);
    return url.protocol === "https:" && /(?:webmcp|model[-_.]?context|standard[-_.]?actions|origin[-_.]?trials)/i.test(url.pathname);
  } catch {
    return false;
  }
}

function publicEvidenceUrl(value: string): string {
  try {
    const url = new URL(value);
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return value.slice(0, 500);
  }
}

const RUNTIME_SCRIPT_SIGNATURE = /(?:modelContext|registerTool|WebMCP|webmcp)/i;

async function fetchPotentialRuntimeScript(url: string): Promise<string | null> {
  const response = await safeFetchText(url, {
    method: "GET",
    headers: { "User-Agent": SCANNER_UA, Accept: "text/javascript, application/javascript, */*;q=0.1" },
    timeoutMs: 5_000,
    maxBodyBytes: 500_000,
  });
  if (!response.ok || !RUNTIME_SCRIPT_SIGNATURE.test(response.body)) return null;
  return response.body;
}

async function probeViaPlaywright(urls: string[]): Promise<WebMCPProbe> {
  // playwright-core carries all client logic: locally it launches the
  // browsers `npx playwright install` downloaded; in serverless (no browser
  // binaries) only the remote-connect path can succeed. Dynamic import so a
  // deploy that failed to bundle it degrades to Firecrawl instead of a 500.
  let chromium: (typeof import("playwright-core"))["chromium"];
  try {
    ({ chromium } = await import("playwright-core"));
  } catch (e) {
    return probeFailure(`playwright_not_installed:${e instanceof Error ? e.message.split("\n")[0] : e}`, "playwright");
  }

  const endpoint = remoteBrowserEndpoint();
  const remoteProtocol = endpoint ? remoteBrowserProtocol(endpoint) : undefined;
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    // WebMCP is a real runtime feature in Chromium (Chrome 149+ origin
    // trial): the flag exposes document.modelContext / navigator.modelContext
    // to secure-context pages, and the WebMCP CDP domain streams actual tool
    // registrations — the strongest possible detection tier.
    browser = endpoint
      ? remoteProtocol === "playwright"
        ? await chromium.connect(endpoint, { timeout: 10_000 })
        : await chromium.connectOverCDP(endpoint, { timeout: 10_000 })
      : await (async () => {
          const resolved = await resolvePublicHost(urls[0]);
          const resolverRule = `--host-resolver-rules=MAP ${resolved.url.hostname} ${resolved.address}, EXCLUDE localhost`;
          return chromium.launch({ headless: true, args: [...WEBMCP_LAUNCH_ARGS, resolverRule], timeout: 10_000 });
        })();
    const remoteContext = remoteProtocol === "cdp" ? browser.contexts()[0] : undefined;
    const page = remoteContext
      ? await remoteContext.newPage()
      : await browser.newPage({ userAgent: SCANNER_UA });

    let cdpTools: WebMCPToolDescriptor[] = [];
    let protocolDomainAvailable = false;
    let targetOrigin = new URL(urls[0]).origin;
    const blockedRuntimeUrls = new Set<string>();
    const runtimeScriptCache = new Map<string, string | null>();
    let externalRuntimeBudget = 3;
    let cdp: import("playwright-core").CDPSession | undefined;
    try {
      cdp = await page.context().newCDPSession(page);
    } catch {
      if (remoteProtocol === "cdp") throw new Error("cdp_session_unavailable");
    }

    if (remoteProtocol === "cdp" && cdp) {
      // Playwright's page.route is not supported over Browserless CDP. Use
      // the protocol Fetch domain instead so the SSRF boundary remains intact.
      await cdp.send("Network.setUserAgentOverride", { userAgent: SCANNER_UA });
      cdp.on("Fetch.requestPaused", (event) => {
        void (async () => {
          if (isWebMCPProbeRequestAllowed(event.request.url, targetOrigin, event.resourceType)) {
            await cdp?.send("Fetch.continueRequest", { requestId: event.requestId });
            return;
          }
          if (isPotentialWebMCPRuntimeUrl(event.request.url, event.resourceType)) {
            const evidenceUrl = publicEvidenceUrl(event.request.url);
            let body = runtimeScriptCache.get(evidenceUrl);
            if (body === undefined && externalRuntimeBudget > 0) {
              externalRuntimeBudget -= 1;
              body = await fetchPotentialRuntimeScript(event.request.url);
              runtimeScriptCache.set(evidenceUrl, body);
            }
            if (body) {
              await cdp?.send("Fetch.fulfillRequest", {
                requestId: event.requestId,
                responseCode: 200,
                responseHeaders: [{ name: "Content-Type", value: "application/javascript; charset=utf-8" }],
                body: Buffer.from(body).toString("base64"),
              });
              return;
            }
            blockedRuntimeUrls.add(evidenceUrl);
          }
          await cdp?.send("Fetch.failRequest", { requestId: event.requestId, errorReason: "BlockedByClient" });
        })().catch(() => cdp?.send("Fetch.failRequest", {
          requestId: event.requestId,
          errorReason: "BlockedByClient",
        }).catch(() => undefined));
      });
      await cdp.send("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
    } else {
      await page.route("**/*", async (route) => {
        if (isWebMCPProbeRequestAllowed(
          route.request().url(),
          targetOrigin,
          route.request().resourceType(),
        )) return route.continue();
        if (isPotentialWebMCPRuntimeUrl(route.request().url(), route.request().resourceType())) {
          const evidenceUrl = publicEvidenceUrl(route.request().url());
          let body = runtimeScriptCache.get(evidenceUrl);
          if (body === undefined && externalRuntimeBudget > 0) {
            externalRuntimeBudget -= 1;
            body = await fetchPotentialRuntimeScript(route.request().url());
            runtimeScriptCache.set(evidenceUrl, body);
          }
          if (body) return route.fulfill({ status: 200, contentType: "application/javascript; charset=utf-8", body });
          blockedRuntimeUrls.add(evidenceUrl);
        }
        await route.abort("blockedbyclient");
      });
    }

    try {
      if (!cdp) throw new Error("cdp_session_unavailable");
      cdp.on(
        "WebMCP.toolsAdded" as Parameters<typeof cdp.on>[0],
        (e) => {
          cdpTools.push(...normalizeWebMCPTools((e as { tools?: unknown[] }).tools));
        },
      );
      await cdp.send("WebMCP.enable" as Parameters<typeof cdp.send>[0]);
      protocolDomainAvailable = true;
    } catch {
      /* older Chromium without the WebMCP domain — DOM-level detection still runs */
    }

    const contexts: WebMCPContextObservation[] = [];
    const descriptorsByContext = new Map<string, WebMCPToolDescriptor[]>();
    const declaredToolNames = new Set<string>();
    let registrationCodeDetected = false;
    let modelContextPresent = false;
    let runtimeRegistryAvailable = false;
    let witnessAvailable = false;
    const deadline = Date.now() + 28_000;

    for (let index = 0; index < urls.length && Date.now() < deadline; index += 1) {
      const requestedUrl = urls[index];
      targetOrigin = new URL(requestedUrl).origin;
      cdpTools = [];
      try {
        await page.goto(requestedUrl, {
          waitUntil: "domcontentloaded",
          timeout: Math.min(10_000, Math.max(1_000, deadline - Date.now())),
        });
        await page.waitForTimeout(Math.min(750, Math.max(0, deadline - Date.now())));
        const runtimeSnapshot = await pollRuntimeToolRegistry(
          () => page.evaluate(RUNTIME_TOOLS_SCRIPT),
          (milliseconds) => page.waitForTimeout(Math.min(milliseconds, Math.max(0, deadline - Date.now()))),
          index === 0 ? 8 : 4,
        );
        const raw = await page.evaluate(PROBE_SCRIPT);
        const html = await page.content();
        const perPage = interpretProbe(raw, html, endpoint ? "playwright-remote" : "playwright");
        for (const name of perPage.declaredToolNames) declaredToolNames.add(name);
        registrationCodeDetected ||= perPage.registrationCodeDetected;
        modelContextPresent ||= perPage.modelContextPresent;
        runtimeRegistryAvailable ||= runtimeSnapshot.available;
        const contextWitness = cdpTools.length > 0 || runtimeSnapshot.available;
        witnessAvailable ||= contextWitness;
        const descriptors = normalizeWebMCPTools([...runtimeSnapshot.tools, ...cdpTools]);
        const finalUrl = page.url();
        descriptorsByContext.set(finalUrl, descriptors);
        contexts.push({
          requestedUrl,
          finalUrl,
          toolCount: Math.max(runtimeSnapshot.totalCount, descriptors.length),
          toolNames: descriptors.map((tool) => tool.name),
          witnessAvailable: contextWitness,
        });
      } catch (error) {
        contexts.push({ requestedUrl, finalUrl: page.url() || requestedUrl, toolCount: 0, toolNames: [], witnessAvailable: false });
        console.warn(`[render] webmcp_context_failed ${JSON.stringify({
          url: publicEvidenceUrl(requestedUrl),
          error: error instanceof Error ? error.message.split("\n")[0] : String(error),
        })}`);
      }
    }

    const inventory = buildWebMCPInventory(contexts, descriptorsByContext, [...blockedRuntimeUrls]);
    const probe: WebMCPProbe = {
      ok: true,
      activeToolNames: inventory.tools.map((tool) => tool.name),
      declaredToolNames: [...declaredToolNames],
      registrationCodeDetected,
      modelContextPresent: inventory.totalCount > 0 || modelContextPresent,
      protocolDomainAvailable,
      runtimeRegistryAvailable,
      witnessAvailable,
      inventory,
      blockedRuntimeUrls: [...blockedRuntimeUrls],
      renderer: endpoint ? "playwright-remote" : "playwright",
      remoteProtocol,
      browserVersion: browser.version(),
    };
    console.info(`[render] webmcp_probe ${JSON.stringify({
      renderer: probe.renderer,
      remoteProtocol,
      browserVersion: probe.browserVersion,
      protocolDomainAvailable,
      runtimeRegistryAvailable,
      observedToolCount: inventory.totalCount,
      contextsScanned: contexts.length,
      contextDependent: inventory.contextDependent,
      blockedRuntimeCount: blockedRuntimeUrls.size,
      declaredToolCount: probe.declaredToolNames.length,
      witnessAvailable: probe.witnessAvailable,
    })}`);
    return probe;
  } catch (e) {
    return probeFailure(`playwright_${e instanceof Error ? e.message : String(e)}`, "playwright");
  } finally {
    await browser?.close().catch(() => {});
  }
}

export async function probeWebMCP(input: string | string[]): Promise<WebMCPProbe> {
  // Resolve redirects through the hardened HTTP client first. The renderer is
  // only ever given a public final URL, and local Chromium pins that hostname.
  const requested = [...new Set(Array.isArray(input) ? input : [input])].slice(0, 4);
  const preflights = await Promise.all(requested.map((url) => safeFetchText(url, {
      method: "GET",
      headers: { "User-Agent": SCANNER_UA },
      timeoutMs: 8_000,
      maxBodyBytes: 32_000,
    })));
  const canonicalUrls = [...new Set(preflights.filter((result) => !result.error).map((result) => result.finalUrl))];
  if (canonicalUrls.length === 0) {
    return probeFailure(`preflight:${preflights.map((result) => result.error ?? `http_${result.status}`).join("+")}`);
  }
  const playwright = await probeViaPlaywright(canonicalUrls);
  if (playwright.ok) return playwright;
  // Surface the reason in ops logs — a scan that silently degrades to
  // Firecrawl hides remote-browser misconfiguration otherwise.
  console.warn(`[render] playwright probe unavailable (${playwright.error}); falling back to firecrawl`);

  const firecrawl = await probeViaFirecrawl(canonicalUrls[0]);
  if (firecrawl.ok) return firecrawl;

  // Both failed — surface both errors so the stored signal says exactly why.
  return probeFailure(`${playwright.error}+${firecrawl.error}`);
}
