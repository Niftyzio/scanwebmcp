/**
 * Renderer interface — spec §10: the renderer stays behind an interface, and
 * plain-HTTP paths must always be able to complete a scan without it.
 *
 * One job only: the D3 WebMCP probe, which needs a rendered DOM. Failures are
 * recorded, never fatal — a scan without a render says "not checked", not
 * "absent".
 *
 * Renderer chain (first success wins):
 *  1. Firecrawl — keyed when FIRECRAWL_API_KEY is set (real rate limits),
 *     keyless otherwise (anonymous tier, 429s under repeated use).
 *  2. Local Playwright — a renderer we own (spec §10: steps that are ours must
 *     always be able to complete a scan alone). Loaded dynamically so deploys
 *     without the package (e.g. Vercel serverless) degrade gracefully.
 *
 * Detection tiers (ordinary headless browsers do NOT implement
 * document.modelContext, so presence of the API itself is the weakest signal):
 *  1. manifest  — window.__webmcpToolManifest / <html data-webmcp-tools>,
 *                 the detectability convention we publish at /make-callable
 *  2. code      — registerTool call patterns in the rendered document's markup
 *  3. active    — a live modelContext (polyfill or agent-capable environment)
 */

import { SCANNER_UA } from "./engine";

export interface WebMCPProbe {
  ok: boolean;
  toolNames: string[];
  registrationCodeDetected: boolean;
  modelContextPresent: boolean;
  renderer?: "firecrawl" | "playwright";
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
  return { ok: false, toolNames: [], registrationCodeDetected: false, modelContextPresent: false, renderer, error };
}

/** Interpret a probe-script return value plus rendered HTML into a verdict. */
function interpretProbe(
  raw: unknown,
  html: string,
  renderer: NonNullable<WebMCPProbe["renderer"]>,
): WebMCPProbe {
  let present = false;
  let toolNames: string[] = [];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as { present?: boolean; manifest?: string[] | null; dataAttr?: string | null };
      present = !!parsed.present;
      if (Array.isArray(parsed.manifest)) toolNames = parsed.manifest.map(String);
      else if (parsed.dataAttr) toolNames = parsed.dataAttr.split(",").map((s) => s.trim()).filter(Boolean);
    } catch {
      /* unparseable return — fall through to code detection */
    }
  }
  const registrationCodeDetected =
    /modelContext\s*\.\s*registerTool|registerTool\s*\(\s*\{|__webmcpToolManifest|data-webmcp-tools/.test(html);

  return { ok: true, toolNames, registrationCodeDetected, modelContextPresent: present, renderer };
}

async function probeViaFirecrawl(url: string): Promise<WebMCPProbe> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45_000);
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

async function probeViaPlaywright(url: string): Promise<WebMCPProbe> {
  let chromium: (typeof import("playwright"))["chromium"];
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    return probeFailure("playwright_not_installed", "playwright");
  }

  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    // WebMCP is a real runtime feature in this Chromium (Chrome 149+ origin
    // trial): the flag exposes document.modelContext / navigator.modelContext
    // to secure-context pages, and the WebMCP CDP domain streams actual tool
    // registrations — the strongest possible detection tier.
    browser = await chromium.launch({ headless: true, args: ["--enable-blink-features=WebMCP"] });
    const page = await browser.newPage({ userAgent: SCANNER_UA });

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

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    // Same settle window as the Firecrawl path, so both renderers measure the
    // same thing: tools registered within 2.5s of DOM ready.
    await page.waitForTimeout(2_500);
    const raw = await page.evaluate(PROBE_SCRIPT);
    const html = await page.content();
    const probe = interpretProbe(raw, html, "playwright");
    if (cdpObserved && cdpTools.length > 0) {
      // Live registrations observed against a real modelContext: report those
      // names (deduped with any manifest) and mark the context active.
      probe.toolNames = [...new Set([...cdpTools, ...probe.toolNames])].slice(0, 25);
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
  const firecrawl = await probeViaFirecrawl(url);
  if (firecrawl.ok) return firecrawl;

  const playwright = await probeViaPlaywright(url);
  if (playwright.ok) return playwright;

  // Both failed — surface both errors so the stored signal says exactly why.
  return probeFailure(`${firecrawl.error}+${playwright.error}`);
}
