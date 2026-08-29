/**
 * Renderer interface — spec §10: the renderer stays behind an interface, and
 * plain-HTTP paths must always be able to complete a scan without it.
 *
 * v0 implementation: Firecrawl keyless (no account, no API key). One job only:
 * the D3 WebMCP probe, which needs a rendered DOM. Failures are recorded, never
 * fatal — a scan without a render says "not checked", not "absent".
 *
 * Detection tiers (ordinary headless browsers do NOT implement
 * document.modelContext, so presence of the API itself is the weakest signal):
 *  1. manifest  — window.__webmcpToolManifest / <html data-webmcp-tools>,
 *                 the detectability convention we publish at /make-callable
 *  2. code      — registerTool call patterns in the rendered document's markup
 *  3. active    — a live modelContext (polyfill or agent-capable environment)
 */

export interface WebMCPProbe {
  ok: boolean;
  toolNames: string[];
  registrationCodeDetected: boolean;
  modelContextPresent: boolean;
  error?: string;
}

const PROBE_SCRIPT = `JSON.stringify({
  present: typeof document.modelContext !== "undefined",
  manifest: Array.isArray(window.__webmcpToolManifest) ? window.__webmcpToolManifest.slice(0, 25) : null,
  dataAttr: document.documentElement.dataset.webmcpTools || null
})`;

export async function probeWebMCP(url: string): Promise<WebMCPProbe> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45_000);
    const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
    if (!res.ok) return { ok: false, toolNames: [], registrationCodeDetected: false, modelContextPresent: false, error: `firecrawl_http_${res.status}` };

    const j = (await res.json()) as {
      success?: boolean;
      data?: { html?: string; actions?: { javascriptReturns?: { type: string; value: unknown }[] } };
    };
    if (!j.success) return { ok: false, toolNames: [], registrationCodeDetected: false, modelContextPresent: false, error: "firecrawl_unsuccessful" };

    let present = false;
    let toolNames: string[] = [];
    const ret = j.data?.actions?.javascriptReturns?.[0]?.value;
    if (typeof ret === "string") {
      try {
        const parsed = JSON.parse(ret) as { present?: boolean; manifest?: string[] | null; dataAttr?: string | null };
        present = !!parsed.present;
        if (Array.isArray(parsed.manifest)) toolNames = parsed.manifest.map(String);
        else if (parsed.dataAttr) toolNames = parsed.dataAttr.split(",").map((s) => s.trim()).filter(Boolean);
      } catch {
        /* unparseable return — fall through to code detection */
      }
    }

    const html = j.data?.html ?? "";
    const registrationCodeDetected =
      /modelContext\s*\.\s*registerTool|registerTool\s*\(\s*\{|__webmcpToolManifest|data-webmcp-tools/.test(html);

    return { ok: true, toolNames, registrationCodeDetected, modelContextPresent: present };
  } catch (e) {
    return {
      ok: false,
      toolNames: [],
      registrationCodeDetected: false,
      modelContextPresent: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
