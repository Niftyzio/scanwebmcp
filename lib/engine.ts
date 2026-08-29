/**
 * Agent Surface Scan — v0 signal engine.
 *
 * Plain-HTTP signals only (no headless rendering in v0). Every probe stores a
 * VALIDATED verdict, never a bare status code: a 200 that serves a login page
 * is not an MCP endpoint, and an llms.txt that returns HTML is not an llms.txt.
 * (Both cases were observed in the 29 Aug 2026 probe run that this engine is
 * ported from — see findings-probe.md in the project docs.)
 *
 * Rubric: Agent Surface Ladder v1.0. Scores are absolute in v0 and presented
 * with rung + evidence only; percentiles arrive with the benchmark corpus.
 */

import { probeWebMCP } from "./render";

export const RUBRIC_VERSION = "1.0.0";
export const SCANNER_UA =
  "AgentSurfaceScan/0.1 (+https://agentsurfacescan.com/about-scanner)";
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";

const FETCH_TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 1_500_000;
const MAX_PAGESET_PAGES = 6; // homepage + up to 5 discovered pages

export type Dimension = "D1" | "D2" | "D3" | "D4" | "D5";

export interface Signal {
  dimension: Dimension;
  signalKey: string;
  valueBool?: boolean;
  valueNum?: number;
  valueText?: string;
  evidenceUrl: string;
  evidenceSnippet?: string; // capped at 500 chars, public content only
  observedAt: string;
}

export interface ScanResult {
  domain: string;
  rubricVersion: string;
  startedAt: string;
  completedAt: string;
  rung: 0 | 1 | 2 | 3 | 4;
  rungName: "Invisible" | "Readable" | "Answerable" | "Callable" | "Transactable";
  scores: { d1: number; d2: number; d3: number; d4: number; d5: number; composite: number };
  signals: Signal[];
  pagesScanned: string[];
  errors: string[];
  /** True when the homepage could not be genuinely fetched (WAF challenge,
   *  403, empty response). Signals below D1's reachability line were never
   *  measured — a degraded scan must never present them as findings. */
  degraded: boolean;
}

const AI_BOTS = ["GPTBot", "ClaudeBot", "Google-Extended", "PerplexityBot"] as const;

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

interface FetchOutcome {
  ok: boolean;
  status: number;
  contentType: string;
  body: string;
  finalUrl: string;
  error?: string;
}

async function politeFetch(
  url: string,
  ua: string = SCANNER_UA,
  method: "GET" | "HEAD" = "GET",
): Promise<FetchOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      redirect: "follow",
      headers: { "User-Agent": ua, Accept: "*/*" },
      signal: controller.signal,
    });
    const contentType = res.headers.get("content-type") ?? "";
    let body = "";
    if (method === "GET") {
      const raw = await res.arrayBuffer();
      body = new TextDecoder("utf-8", { fatal: false }).decode(
        raw.slice(0, MAX_BODY_BYTES),
      );
    }
    return { ok: res.ok, status: res.status, contentType, body, finalUrl: res.url };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      contentType: "",
      body: "",
      finalUrl: url,
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Reject scans of private/internal targets before any fetch happens. */
export function validateTarget(input: string): { origin: string; domain: string } {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    throw new Error("Not a valid URL.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:")
    throw new Error("Only http(s) targets can be scanned.");
  const host = url.hostname.toLowerCase();
  const privatePatterns = [
    /^localhost$/, /^127\./, /^10\./, /^192\.168\./, /^169\.254\./,
    /^172\.(1[6-9]|2\d|3[01])\./, /^0\./, /^\[?::1\]?$/, /\.local$/, /\.internal$/,
  ];
  if (privatePatterns.some((p) => p.test(host)) || !host.includes("."))
    throw new Error("Private and internal hosts cannot be scanned.");
  return { origin: url.origin, domain: host };
}

const looksLikeHtml = (body: string) =>
  /<\s*(!doctype|html|head|body)[\s>]/i.test(body.slice(0, 1000));

const snippet = (s: string, n = 500) => s.replace(/\s+/g, " ").trim().slice(0, n);

// ---------------------------------------------------------------------------
// D1 · Legibility
// ---------------------------------------------------------------------------

function parseRobots(body: string): Record<string, "allowed" | "blocked" | "unmentioned"> {
  const verdicts: Record<string, "allowed" | "blocked" | "unmentioned"> = {};
  // Group robots.txt into UA-block sections (consecutive user-agent lines share rules).
  const sections: { agents: string[]; rules: string[] }[] = [];
  let current: { agents: string[]; rules: string[] } | null = null;
  let lastWasAgent = false;
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const m = line.match(/^user-agent:\s*(.+)$/i);
    if (m) {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        sections.push(current);
      }
      current.agents.push(m[1].trim());
      lastWasAgent = true;
    } else if (current) {
      current.rules.push(line);
      lastWasAgent = false;
    }
  }
  for (const bot of AI_BOTS) {
    const specific = sections.filter((s) =>
      s.agents.some((a) => a.toLowerCase() === bot.toLowerCase()),
    );
    if (specific.length === 0) {
      verdicts[bot] = "unmentioned";
      continue;
    }
    const blockedAll = specific.some((s) =>
      s.rules.some((r) => /^disallow:\s*\/\s*$/i.test(r)),
    );
    verdicts[bot] = blockedAll ? "blocked" : "allowed";
  }
  return verdicts;
}

async function checkD1(origin: string, signals: Signal[], errors: string[]) {
  const now = () => new Date().toISOString();

  // robots.txt — AI-agent directives
  const robots = await politeFetch(`${origin}/robots.txt`);
  const robotsIsText = robots.ok && !looksLikeHtml(robots.body);
  const verdicts = robotsIsText ? parseRobots(robots.body) : {};
  for (const bot of AI_BOTS) {
    signals.push({
      dimension: "D1",
      signalKey: `robots_${bot.toLowerCase().replace(/-/g, "_")}`,
      valueText: robotsIsText ? verdicts[bot] : "no_robots_txt",
      evidenceUrl: `${origin}/robots.txt`,
      evidenceSnippet: robotsIsText ? snippet(robots.body, 300) : undefined,
      observedAt: now(),
    });
  }

  // llms.txt / llms-full.txt — must parse as text, not a soft-404 HTML page
  for (const file of ["llms.txt", "llms-full.txt"]) {
    const r = await politeFetch(`${origin}/${file}`);
    const genuine = r.ok && !looksLikeHtml(r.body) && r.body.trim().length > 40;
    signals.push({
      dimension: "D1",
      signalKey: file.replace(/[.-]/g, "_"),
      valueBool: genuine,
      valueText: !r.ok ? "absent" : genuine ? "present" : "soft_404_or_empty",
      evidenceUrl: `${origin}/${file}`,
      evidenceSnippet: genuine ? snippet(r.body, 300) : undefined,
      observedAt: now(),
    });
  }

  // sitemap.xml
  const sitemap = await politeFetch(`${origin}/sitemap.xml`);
  const sitemapGenuine =
    sitemap.ok && /<(urlset|sitemapindex)[\s>]/i.test(sitemap.body.slice(0, 2000));
  signals.push({
    dimension: "D1",
    signalKey: "sitemap_xml",
    valueBool: sitemapGenuine,
    evidenceUrl: `${origin}/sitemap.xml`,
    observedAt: now(),
  });

  // Homepage — two UAs, to separate thin content / bot walls / agent negotiation
  const asBot = await politeFetch(`${origin}/`, SCANNER_UA);
  const asBrowser = await politeFetch(`${origin}/`, BROWSER_UA);
  if (!asBot.ok && !asBrowser.ok)
    errors.push(`Homepage unreachable (${asBot.error ?? asBot.status}).`);

  // Bot-wall detection: a challenge page is not the site. Scoring it as
  // content produced confidently wrong zeros (observed 29 Aug: Cloudflare
  // "Just a moment..." on a 403 served to our production IP).
  const challengeMarkers = /just a moment|attention required|access denied|are you a robot|cf-challenge|_cf_chl|captcha-delivery|px-captcha|incapsula/i;
  const bothBlocked =
    (!asBot.ok || challengeMarkers.test(asBot.body.slice(0, 3000))) &&
    (!asBrowser.ok || challengeMarkers.test(asBrowser.body.slice(0, 3000)));
  if (bothBlocked) {
    signals.push({
      dimension: "D1",
      signalKey: "agent_access_blocked",
      valueBool: true,
      valueText: `http_${asBot.status}`,
      evidenceUrl: `${origin}/`,
      evidenceSnippet: snippet(asBot.body || asBrowser.body || `status ${asBot.status}`, 300),
      observedAt: now(),
    });
  }

  const botIsHtml = looksLikeHtml(asBot.body);
  const botBytes = asBot.body.length;
  const browserBytes = asBrowser.body.length;

  // Agent-facing content negotiation: the site serves a declared agent a
  // different, non-HTML (typically markdown) representation. Observed in the
  // wild (vercel.com, 29 Aug 2026) — a POSITIVE legibility signal that naive
  // "thin HTML = broken" checks misread as rung 0.
  const negotiated =
    asBot.ok && !botIsHtml && asBot.body.trim().length > 200 &&
    looksLikeHtml(asBrowser.body);
  signals.push({
    dimension: "D1",
    signalKey: "agent_content_negotiation",
    valueBool: negotiated,
    evidenceUrl: `${origin}/`,
    evidenceSnippet: negotiated ? snippet(asBot.body, 300) : undefined,
    observedAt: now(),
  });

  const html = botIsHtml ? asBot.body : looksLikeHtml(asBrowser.body) ? asBrowser.body : "";
  // Substance = visible text, not byte count — a lean server-rendered page is
  // MORE agent-legible than a bloated shell (byte floors punished exactly the
  // wrong sites; caught by dogfooding on our own homepage).
  const visibleText = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const substantive = negotiated || visibleText.length > 800;
  signals.push({
    dimension: "D1",
    signalKey: "content_without_js",
    valueBool: substantive,
    valueNum: negotiated ? botBytes : visibleText.length,
    valueText: negotiated
      ? "agent_optimised_alternate"
      : substantive
        ? "substantive_text"
        : browserBytes > botBytes * 3
          ? "possible_bot_challenge"
          : "thin_shell",
    evidenceUrl: `${origin}/`,
    observedAt: now(),
  });

  const title = html.match(/<title[^>]*>([^<]*)</i)?.[1]?.trim() ?? "";
  const metaDesc =
    /<meta[^>]+name=["']description["'][^>]*>/i.test(html) ||
    /<meta[^>]+content=[^>]+name=["']description["']/i.test(html);
  signals.push({
    dimension: "D1",
    signalKey: "title_meta_coherence",
    valueBool: title.length >= 10 && metaDesc,
    valueText: title ? snippet(title, 120) : negotiated ? "negotiated_alternate" : "missing",
    evidenceUrl: `${origin}/`,
    observedAt: now(),
  });

  // Structured data
  const jsonLdBlocks =
    html.match(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) ?? [];
  const types = new Set<string>();
  for (const block of jsonLdBlocks) {
    for (const m of block.matchAll(/"@type"\s*:\s*"([^"]+)"/g)) types.add(m[1]);
  }
  signals.push({
    dimension: "D1",
    signalKey: "structured_data_types",
    valueNum: types.size,
    valueText: [...types].sort().join("|") || "none",
    evidenceUrl: `${origin}/`,
    observedAt: now(),
  });

  return { html, negotiated, types };
}

// ---------------------------------------------------------------------------
// Page-set discovery (crawl policy lite — see spec §4)
// ---------------------------------------------------------------------------

// Keywords must match a WHOLE hyphen/slash-separated word in the path —
// "transfer-pricing" is not a pricing page and "marketing-teams" is not an
// about page (both misdetections caught by the 29 Aug smoke test).
const PAGE_TYPES: { type: string; words: string[] }[] = [
  { type: "pricing", words: ["pricing", "prices", "fees", "plans", "rates"] },
  { type: "services", words: ["services", "solutions", "products", "programmes", "programs", "expertise", "offer", "offers"] },
  { type: "faq", words: ["faq", "faqs", "frequently"] },
  { type: "contact", words: ["contact", "enquiry", "enquiries", "inquiry"] },
  { type: "about", words: ["about", "story", "who-we-are"] },
];

// Content sections are never canonical pages for a page-type.
const EXCLUDED_SECTIONS = /\/(insights?|blog|news|articles?|case-stud|resources?|events?|press|careers?|podcast)(\/|$)/i;

function discoverPages(origin: string, homepageHtml: string): Map<string, string> {
  const found = new Map<string, string>();
  const hrefs = [...new Set(
    [...homepageHtml.matchAll(/href=["']([^"'#?]+)["']/gi)]
      .map((m) => m[1])
      .filter((h) => h.startsWith("/") || h.startsWith(origin))
      .map((h) => (h.startsWith("/") ? origin + h : h)),
  )];
  const candidates = hrefs.flatMap((h) => {
    try {
      const path = new URL(h).pathname.toLowerCase();
      if (EXCLUDED_SECTIONS.test(path)) return [];
      const segments = path.split("/").filter(Boolean);
      if (segments.length === 0 || segments.length > 3) return [];
      const pathWords = segments.flatMap((s) => s.split(/[-_.]/));
      return [{ url: h, path, segments, pathWords }];
    } catch {
      return [];
    }
  });
  for (const { type, words } of PAGE_TYPES) {
    const matches = candidates
      .filter((c) =>
        words.some(
          (w) =>
            // Exact segment ("/pricing/", "/our-fees/") — never a word buried in a
            // compound segment: "transfer-pricing" must not match "pricing".
            c.segments.includes(w) ||
            c.segments.includes(`our-${w}`) ||
            (c.segments.length === 1 && c.pathWords[0] === w),
        ),
      )
      // Prefer the shallowest, shortest path — /pricing beats /services/x/pricing
      .sort((a, b) => a.segments.length - b.segments.length || a.path.length - b.path.length);
    if (matches[0] && found.size < MAX_PAGESET_PAGES - 1) found.set(type, matches[0].url);
  }
  return found;
}

// ---------------------------------------------------------------------------
// D2 · Answerability + D4 · Transactability signals over the page set
// ---------------------------------------------------------------------------

async function checkPageSet(
  origin: string,
  homepageHtml: string,
  signals: Signal[],
): Promise<string[]> {
  const now = () => new Date().toISOString();
  const pages = discoverPages(origin, homepageHtml);
  const scanned: string[] = [`${origin}/`];

  // Locatability signals — "not found" is a finding, not a failure.
  for (const { type } of PAGE_TYPES) {
    signals.push({
      dimension: type === "contact" || type === "about" ? "D4" : "D2",
      signalKey: `${type}_page_locatable`,
      valueBool: pages.has(type),
      valueText: pages.get(type) ?? "not_discoverable_from_nav",
      evidenceUrl: pages.get(type) ?? `${origin}/`,
      observedAt: now(),
    });
  }

  let combinedHtml = homepageHtml;
  for (const [type, url] of pages) {
    const r = await politeFetch(url);
    if (!r.ok) continue;
    scanned.push(url);
    combinedHtml += "\n" + r.body;

    if (type === "pricing") {
      const priceSpecific =
        /[£$€]\s?\d[\d,.]*/.test(r.body) || /\d[\d,.]*\s?(GBP|USD|EUR)\b/.test(r.body);
      const contactForPricing = /contact (us )?for (a )?(pricing|quote|price)/i.test(r.body);
      signals.push({
        dimension: "D2",
        signalKey: "price_specificity",
        valueBool: priceSpecific && !contactForPricing,
        valueText: priceSpecific
          ? contactForPricing ? "prices_present_but_gated_copy" : "specific_prices"
          : contactForPricing ? "contact_for_pricing_only" : "no_prices_found",
        evidenceUrl: url,
        observedAt: now(),
      });
    }
    if (type === "faq") {
      const faqMarkup = /FAQPage/i.test(r.body);
      const faqHeadings = (r.body.match(/<h[23][^>]*>[^<]*\?/gi) ?? []).length;
      signals.push({
        dimension: "D2",
        signalKey: "faq_coverage",
        valueBool: faqMarkup || faqHeadings >= 3,
        valueNum: faqHeadings,
        valueText: faqMarkup ? "faqpage_markup" : `${faqHeadings}_question_headings`,
        evidenceUrl: url,
        observedAt: now(),
      });
    }
  }

  // Signals over everything fetched
  const forms = (combinedHtml.match(/<form[\s>]/gi) ?? []).length;
  signals.push({
    dimension: "D3",
    signalKey: "forms_as_latent_tools",
    valueNum: forms,
    evidenceUrl: `${origin}/`,
    observedAt: now(),
  });

  const hasMailto = /mailto:/i.test(combinedHtml);
  const hasTel = /(^|["'>\s])tel:/i.test(combinedHtml);
  signals.push({
    dimension: "D4",
    signalKey: "contact_affordances",
    valueText:
      hasMailto && forms > 0 ? "email_and_form"
      : hasMailto ? "email"
      : forms > 0 ? "form_only"
      : hasTel ? "phone_only"
      : "none_detected",
    valueBool: hasMailto || forms > 0,
    evidenceUrl: `${origin}/`,
    observedAt: now(),
  });

  const captcha = /recaptcha|hcaptcha|cf-turnstile/i.test(combinedHtml);
  signals.push({
    dimension: "D4",
    signalKey: "friction_captcha",
    valueBool: captcha,
    evidenceUrl: `${origin}/`,
    observedAt: now(),
  });

  const bookingEmbed =
    /calendly\.com|cal\.com\/|savvycal|hubspot.*meetings|acuityscheduling|youcanbook/i.test(
      combinedHtml,
    );
  signals.push({
    dimension: "D3",
    signalKey: "booking_embed",
    valueBool: bookingEmbed,
    evidenceUrl: `${origin}/`,
    observedAt: now(),
  });

  // D5 (crude in v1, weighted accordingly): entity + named people
  const orgMarkup = /"@type"\s*:\s*"(Organization|Corporation|LocalBusiness|\w+Service)"/.test(
    combinedHtml,
  );
  const personMarkup = /"@type"\s*:\s*"Person"/.test(combinedHtml);
  signals.push({
    dimension: "D5",
    signalKey: "entity_clarity",
    valueBool: orgMarkup,
    valueText: orgMarkup ? (personMarkup ? "org_and_people" : "org_only") : "no_entity_markup",
    evidenceUrl: `${origin}/`,
    observedAt: now(),
  });

  return scanned;
}

// ---------------------------------------------------------------------------
// D3 · Callability — validated probes, never bare status codes
// ---------------------------------------------------------------------------

async function checkD3(origin: string, signals: Signal[], skipRender = false) {
  const now = () => new Date().toISOString();
  for (const path of ["/.well-known/mcp", "/mcp"]) {
    const r = await politeFetch(`${origin}${path}`);
    // Validation: an MCP endpoint answers with JSON (or SSE), never an HTML page.
    const contentPlausible =
      r.ok &&
      !looksLikeHtml(r.body) &&
      (/json|event-stream/i.test(r.contentType) || /"jsonrpc"/.test(r.body));
    signals.push({
      dimension: "D3",
      signalKey: `mcp_probe_${path === "/mcp" ? "path" : "well_known"}`,
      valueBool: contentPlausible,
      valueText: !r.ok
        ? "absent"
        : contentPlausible
          ? "plausible_endpoint"
          : "responds_but_not_mcp", // e.g. a login page on 200 — observed in the wild
      evidenceUrl: `${origin}${path}`,
      observedAt: now(),
    });
  }
  // WebMCP detection needs a rendered DOM — renderer behind an interface
  // (lib/render.ts, Firecrawl keyless in v0). Failure means "not checked",
  // never "absent".
  if (skipRender) {
    signals.push({
      dimension: "D3",
      signalKey: "webmcp_registration",
      valueText: "render_skipped_degraded_scan",
      evidenceUrl: `${origin}/`,
      observedAt: now(),
    });
    return;
  }
  const probe = await probeWebMCP(`${origin}/`);
  const verdict = !probe.ok
    ? `render_unavailable:${probe.error ?? "unknown"}`
    : probe.toolNames.length > 0
      ? probe.modelContextPresent
        ? "active_tools_found"
        : "manifest_found"
      : probe.registrationCodeDetected
        ? "registration_code_found"
        : "none_detected";
  signals.push({
    dimension: "D3",
    signalKey: "webmcp_registration",
    valueText: verdict,
    valueBool: probe.ok ? probe.toolNames.length > 0 || probe.registrationCodeDetected : undefined,
    evidenceUrl: `${origin}/`,
    observedAt: now(),
  });
  if (probe.toolNames.length > 0) {
    signals.push({
      dimension: "D3",
      signalKey: "webmcp_tools_found",
      valueNum: probe.toolNames.length,
      valueText: probe.toolNames.slice(0, 25).join("|"),
      evidenceUrl: `${origin}/`,
      evidenceSnippet: `Declared tool manifest: ${probe.toolNames.slice(0, 25).join(", ")}`,
      observedAt: now(),
    });
  }
}

// ---------------------------------------------------------------------------
// Scoring — Ladder v1.0. Weights published on /ladder.
// ---------------------------------------------------------------------------

const sig = (signals: Signal[], key: string) => signals.find((s) => s.signalKey === key);

/**
 * Scoring configuration. The values in this file are the open-source REFERENCE
 * scoring — enough to run the scanner standalone. The hosted instance loads
 * its current weights, gates and refinements from the private rubric_versions
 * store at runtime; refinements are versioned there and are not published.
 */
export interface ScoringConfig {
  weights: { d1: number; d2: number; d3: number; d4: number; d5: number };
  gates: { readable_d1_min: number; answerable_d2_min: number; blocked_bots_invisible: number };
}

export const REFERENCE_SCORING: ScoringConfig = {
  weights: { d1: 0.25, d2: 0.3, d3: 0.2, d4: 0.15, d5: 0.1 },
  gates: { readable_d1_min: 40, answerable_d2_min: 50, blocked_bots_invisible: 3 },
};

function score(signals: Signal[], cfg: ScoringConfig = REFERENCE_SCORING) {
  // D1 (0-100)
  let d1 = 0;
  const blockedBots = AI_BOTS.filter(
    (b) => sig(signals, `robots_${b.toLowerCase().replace(/-/g, "_")}`)?.valueText === "blocked",
  ).length;
  d1 += blockedBots === 0 ? 25 : blockedBots >= 3 ? 0 : 10;
  if (sig(signals, "content_without_js")?.valueBool) d1 += 25;
  if (sig(signals, "llms_txt")?.valueBool) d1 += 15;
  if (sig(signals, "agent_content_negotiation")?.valueBool) d1 += 10;
  if (sig(signals, "sitemap_xml")?.valueBool) d1 += 10;
  if (sig(signals, "title_meta_coherence")?.valueBool) d1 += 10;
  if ((sig(signals, "structured_data_types")?.valueNum ?? 0) > 0) d1 += 5;

  // D2
  let d2 = 0;
  if (sig(signals, "pricing_page_locatable")?.valueBool) d2 += 20;
  if (sig(signals, "price_specificity")?.valueBool) d2 += 30;
  if (sig(signals, "services_page_locatable")?.valueBool) d2 += 20;
  if (sig(signals, "faq_coverage")?.valueBool) d2 += 20;
  if (sig(signals, "faq_page_locatable")?.valueBool) d2 += 10;

  // D3 — bands cut finely at the low end, per the flat-distribution expectation
  let d3 = 0;
  const forms = sig(signals, "forms_as_latent_tools")?.valueNum ?? 0;
  d3 += Math.min(forms * 10, 30);
  if (sig(signals, "booking_embed")?.valueBool) d3 += 20;
  const mcpFound =
    sig(signals, "mcp_probe_well_known")?.valueBool || sig(signals, "mcp_probe_path")?.valueBool;
  const webmcpFound =
    (sig(signals, "webmcp_tools_found")?.valueNum ?? 0) > 0 ||
    sig(signals, "webmcp_registration")?.valueBool === true;
  if (mcpFound) d3 += 50;
  if (webmcpFound) d3 += 50;
  d3 = Math.min(d3, 100);

  // D4
  let d4 = 0;
  const contact = sig(signals, "contact_affordances");
  if (contact?.valueText === "email_and_form") d4 += 40;
  else if (contact?.valueBool) d4 += 25;
  if (sig(signals, "contact_page_locatable")?.valueBool) d4 += 20;
  if (!sig(signals, "friction_captcha")?.valueBool) d4 += 20;
  if (contact?.valueText !== "phone_only" && contact?.valueText !== "none_detected") d4 += 20;

  // D5 (crude, weight 10%)
  let d5 = 0;
  const entity = sig(signals, "entity_clarity");
  if (entity?.valueText === "org_and_people") d5 += 60;
  else if (entity?.valueBool) d5 += 40;
  if (sig(signals, "about_page_locatable")?.valueBool) d5 += 40;

  const w = cfg.weights;
  const composite = Math.round(d1 * w.d1 + d2 * w.d2 + d3 * w.d3 + d4 * w.d4 + d5 * w.d5);

  // Gated rungs: you cannot be Callable while Invisible on D1.
  let rung: 0 | 1 | 2 | 3 | 4 = 0;
  const readable = d1 >= cfg.gates.readable_d1_min && blockedBots < cfg.gates.blocked_bots_invisible;
  const answerable = readable && d2 >= cfg.gates.answerable_d2_min;
  const callable = readable && Boolean(mcpFound || webmcpFound);
  if (readable) rung = 1;
  if (answerable) rung = 2;
  if (callable) rung = 3;
  // Rung 4 requires an end-to-end action — not assessable without invocation; v0 caps at 3.

  const rungName = (["Invisible", "Readable", "Answerable", "Callable", "Transactable"] as const)[rung];
  return { scores: { d1, d2, d3, d4, d5, composite }, rung, rungName };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function runScan(input: string, scoring?: ScoringConfig): Promise<ScanResult> {
  const { origin, domain } = validateTarget(input);
  const startedAt = new Date().toISOString();
  const signals: Signal[] = [];
  const errors: string[] = [];

  const { html } = await checkD1(origin, signals, errors);
  const degraded = signals.some((s) => s.signalKey === "agent_access_blocked" && s.valueBool);

  if (degraded) {
    // Do not fabricate D2–D5 measurements from a challenge page. What we CAN
    // honestly report: reachability of the text files, robots verdicts, and
    // the block itself — which for an agent is the finding.
    const startedSignals = signals.filter((s) =>
      ["robots_", "llms_", "sitemap_xml", "agent_access_blocked"].some((p) => s.signalKey.startsWith(p)),
    );
    signals.length = 0;
    signals.push(...startedSignals);
    await checkD3(origin, signals, true); // fixed-path probes only; no render on a walled site
    return {
      domain,
      rubricVersion: RUBRIC_VERSION,
      startedAt,
      completedAt: new Date().toISOString(),
      rung: 0,
      rungName: "Invisible",
      scores: { d1: 0, d2: 0, d3: 0, d4: 0, d5: 0, composite: 0 },
      signals,
      pagesScanned: [`${origin}/`],
      errors: [...errors, "Scan degraded: the site served our agent a bot-challenge page instead of content. Unmeasured dimensions are reported as unmeasured, not zero."],
      degraded: true,
    };
  }

  const pagesScanned = await checkPageSet(origin, html, signals);
  await checkD3(origin, signals);

  const { scores, rung, rungName } = score(signals, scoring);
  return {
    domain,
    rubricVersion: RUBRIC_VERSION,
    startedAt,
    completedAt: new Date().toISOString(),
    rung,
    rungName,
    scores,
    signals,
    pagesScanned,
    errors,
    degraded: false,
  };
}
