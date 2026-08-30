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

export interface WebMCPProbe {
  ok: boolean;
  /** Registrations witnessed by the browser protocol. This is callability evidence. */
  activeToolNames: string[];
  /** Names advertised in a page convention. Useful discovery, not proof of callability. */
  declaredToolNames: string[];
  registrationCodeDetected: boolean;
  modelContextPresent: boolean;
  /** True only when the browser protocol could observe registerTool events.
   * A rendered page without this witness is unmeasured, never a negative. */
  witnessAvailable: boolean;
  renderer?: "firecrawl" | "playwright" | "playwright-remote";
  error?: string;
}

// The entry point is mid-migration in the wild: Chrome's origin trial exposes
// both document.modelContext and navigator.modelContext — detect either.
const PROBE_SCRIPT = `JSON.stringify({
  present: typeof document.modelContext !== "undefined" || typeof navigator.modelContext !== "undefined",
  manifest: Array.isArray(window.__webmcpToolManifest) ? window.__webmcpToolManifest.slice(0, 25) : null,
  dataAttr: document.documentElement.dataset.webmcpTools || null
})`;

function probeFailure(error: string, renderer?: WebMCPProbe["renderer"]): WebMCPProbe {
  return { ok: false, activeToolNames: [], declaredToolNames: [], registrationCodeDetected: false, modelContextPresent: false, witnessAvailable: false, renderer, error };
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

  return { ok: true, activeToolNames: [], declaredToolNames, registrationCodeDetected, modelContextPresent: present, witnessAvailable: false, renderer };
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
      verdict: probe.declaredToolNames.length > 0
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

const WEBMCP_LAUNCH_ARGS = ["--enable-blink-features=WebMCP"];

/**
 * Remote browser endpoint (e.g. Browserless) for serverless deploys that
 * cannot run Chromium. The env var holds the full wss:// URL including the
 * token; the WebMCP launch flag is appended unless the URL already sets one.
 */
function remoteBrowserEndpoint(): string | undefined {
  const base = process.env.BROWSER_WS_ENDPOINT;
  if (!base) return undefined;
  if (base.includes("launch=")) return base;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}launch=${encodeURIComponent(JSON.stringify({ args: WEBMCP_LAUNCH_ARGS }))}`;
}

async function probeViaPlaywright(url: string): Promise<WebMCPProbe> {
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
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    // WebMCP is a real runtime feature in Chromium (Chrome 149+ origin
    // trial): the flag exposes document.modelContext / navigator.modelContext
    // to secure-context pages, and the WebMCP CDP domain streams actual tool
    // registrations — the strongest possible detection tier.
    browser = endpoint
      ? await chromium.connect(endpoint, { timeout: 10_000 })
      : await (async () => {
          const resolved = await resolvePublicHost(url);
          const resolverRule = `--host-resolver-rules=MAP ${resolved.url.hostname} ${resolved.address}, EXCLUDE localhost`;
          return chromium.launch({ headless: true, args: [...WEBMCP_LAUNCH_ARGS, resolverRule], timeout: 10_000 });
        })();
    const page = await browser.newPage({ userAgent: SCANNER_UA });

    const targetOrigin = new URL(url).origin;
    await page.route("**/*", async (route) => {
      const requestUrl = route.request().url();
      if (/^(data|blob|about):/i.test(requestUrl)) return route.continue();
      try {
        if (new URL(requestUrl).origin === targetOrigin) return route.continue();
      } catch {
        // Invalid requests are aborted below.
      }
      await route.abort("blockedbyclient");
    });

    const cdpTools: string[] = [];
    let cdpObserved = false;
    try {
      const cdp = await page.context().newCDPSession(page);
      cdp.on(
        "WebMCP.toolsAdded" as Parameters<typeof cdp.on>[0],
        (e) => {
          for (const t of (e as { tools?: { name?: unknown }[] }).tools ?? []) {
            if (typeof t.name === "string") cdpTools.push(t.name);
          }
        },
      );
      await cdp.send("WebMCP.enable" as Parameters<typeof cdp.send>[0]);
      cdpObserved = true;
    } catch {
      /* older Chromium without the WebMCP domain — DOM-level detection still runs */
    }

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 12_000 });
    // Same settle window as the Firecrawl path, so both renderers measure the
    // same thing: tools registered within 2.5s of DOM ready.
    await page.waitForTimeout(1_500);
    const raw = await page.evaluate(PROBE_SCRIPT);
    const html = await page.content();
    const probe = interpretProbe(raw, html, endpoint ? "playwright-remote" : "playwright");
    probe.witnessAvailable = cdpObserved;
    if (cdpObserved && cdpTools.length > 0) {
      // Live registrations observed against a real modelContext: report those
      // names (deduped with any manifest) and mark the context active.
      probe.activeToolNames = [...new Set(cdpTools)].slice(0, 25);
      probe.modelContextPresent = true;
    } else if (cdpObserved) {
      // We enabled modelContext ourselves, so its mere presence proves nothing
      // about the page — only observed registrations count as "active".
      probe.modelContextPresent = false;
    }
    return probe;
  } catch (e) {
    return probeFailure(`playwright_${e instanceof Error ? e.message : String(e)}`, "playwright");
  } finally {
    await browser?.close().catch(() => {});
  }
}

export async function probeWebMCP(url: string): Promise<WebMCPProbe> {
  // Resolve redirects through the hardened HTTP client first. The renderer is
  // only ever given a public final URL, and local Chromium pins that hostname.
  const canonical = await safeFetchText(url, {
    method: "GET",
    headers: { "User-Agent": SCANNER_UA },
    timeoutMs: 8_000,
    maxBodyBytes: 32_000,
  });
  if (canonical.error) return probeFailure(`preflight:${canonical.error}`);
  const playwright = await probeViaPlaywright(canonical.finalUrl);
  if (playwright.ok) return playwright;
  // Surface the reason in ops logs — a scan that silently degrades to
  // Firecrawl hides remote-browser misconfiguration otherwise.
  console.warn(`[render] playwright probe unavailable (${playwright.error}); falling back to firecrawl`);

  const firecrawl = await probeViaFirecrawl(canonical.finalUrl);
  if (firecrawl.ok) return firecrawl;

  // Both failed — surface both errors so the stored signal says exactly why.
  return probeFailure(`${playwright.error}+${firecrawl.error}`);
}
