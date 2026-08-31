/**
 * ScanWebMCP.com — v0 signal engine.
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

import { classifyWebMCPProbe, probeWebMCP } from "./render";
import { safeFetchText, validatePublicUrl } from "./safe-http";
import { siteUrl } from "./site";
import { discoverWebMCPContexts } from "./webmcp-contexts";
import { serializeWebMCPInventory } from "./webmcp-inventory";

export const RUBRIC_VERSION = "1.0.0";
export const SCANNER_UA =
  `AgentSurfaceScan/0.1 (+${siteUrl("/about-scanner")})`;
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
  /** Where the business appears to be based, from its own pages (declared
   *  address, phone prefix, postcode) with the domain ending as fallback. */
  countryGuess: string | null;
}

// Report search/indexing controls separately from model-training controls.
// User-triggered fetchers are deliberately excluded: vendors document that
// they may not follow robots.txt in the same way as indexing crawlers.
const AI_CRAWLERS = [
  "OAI-SearchBot",
  "GPTBot",
  "Claude-SearchBot",
  "ClaudeBot",
  "Google-Extended",
  "PerplexityBot",
] as const;

// The published v1.0 rubric scores these four controls. Keep this stable until
// a new rubric version is released so historical benchmarks do not move.
const RUBRIC_AI_BOTS = ["GPTBot", "ClaudeBot", "Google-Extended", "PerplexityBot"] as const;

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

interface FetchOutcome {
  ok: boolean;
  status: number;
  contentType: string;
  body: string;
  finalUrl: string;
  headers: Headers;
  error?: string;
}

/** A transport-level homepage failure is not a measurement of the target.
 * Retrying is safer than persisting a confident zero-score result. */
export function homepageTransportError(
  asBot: Pick<FetchOutcome, "status" | "error">,
  asBrowser: Pick<FetchOutcome, "status" | "error">,
): string | null {
  if (asBot.status !== 0 || asBrowser.status !== 0) return null;
  return asBot.error ?? asBrowser.error ?? "unknown transport error";
}

async function politeFetch(
  url: string,
  ua: string = SCANNER_UA,
  method: "GET" | "HEAD" | "POST" = "GET",
  request?: { headers?: Record<string, string>; body?: string },
): Promise<FetchOutcome> {
  return safeFetchText(url, {
    method,
    headers: { "User-Agent": ua, Accept: "*/*", ...request?.headers },
    body: request?.body,
    timeoutMs: FETCH_TIMEOUT_MS,
    maxBodyBytes: MAX_BODY_BYTES,
  });
}

/** Reject syntactically private/internal targets before any fetch happens.
 * DNS answers are pinned and revalidated by safeFetchText for every hop. */
export function validateTarget(input: string): { origin: string; domain: string } {
  try {
    const url = validatePublicUrl(/^https?:\/\//i.test(input) ? input : `https://${input}`);
    return { origin: url.origin, domain: url.hostname.toLowerCase().replace(/\.$/, "") };
  } catch (error) {
    if (error instanceof TypeError) throw new Error("Not a valid URL.");
    throw error;
  }
}

const looksLikeHtml = (body: string) =>
  /<\s*(!doctype|html|head|body)[\s>]/i.test(body.slice(0, 1000));

const snippet = (s: string, n = 500) => s.replace(/\s+/g, " ").trim().slice(0, n);

export const htmlToVisibleText = (html: string) => html
  .replace(/<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>/gi, " ")
  .replace(/<style\b[^>]*>[\s\S]*?<\/style\b[^>]*>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/\s+/g, " ")
  .trim();

// ---------------------------------------------------------------------------
// D1 · Legibility
// ---------------------------------------------------------------------------

type RobotsVerdict = "allowed" | "blocked" | "unmentioned";
interface RobotsRule { allow: boolean; path: string }
interface RobotsSection { agents: string[]; rules: RobotsRule[] }

export interface RobotsPolicy {
  isAllowed(userAgent: string, urlOrPath: string): boolean;
  verdict(userAgent: string, urlOrPath?: string): RobotsVerdict;
}

function robotsPathMatches(rule: string, path: string): boolean {
  if (!rule) return false;
  const anchored = rule.endsWith("$");
  const source = rule
    .replace(/\$$/, "")
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${source}${anchored ? "$" : ""}`).test(path);
}

export function parseRobots(body: string): RobotsPolicy {
  // Consecutive User-agent lines share a group; only Allow/Disallow affect access.
  const sections: RobotsSection[] = [];
  let current: RobotsSection | null = null;
  let lastWasAgent = false;
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) {
      lastWasAgent = false;
      continue;
    }
    const m = line.match(/^user-agent:\s*(.+)$/i);
    if (m) {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        sections.push(current);
      }
      current.agents.push(m[1].trim());
      lastWasAgent = true;
    } else if (current) {
      const rule = line.match(/^(allow|disallow):\s*(.*)$/i);
      if (rule) current.rules.push({ allow: rule[1].toLowerCase() === "allow", path: rule[2].trim() });
      lastWasAgent = false;
    }
  }

  function matchingSections(userAgent: string) {
    const product = userAgent.split(/[\s/]/, 1)[0].toLowerCase();
    const matches = sections.flatMap((section) =>
      section.agents
        .map((agent) => agent.toLowerCase())
        .filter((agent) => agent === "*" || product.includes(agent))
        .map((agent) => ({ section, specificity: agent === "*" ? 0 : agent.length })),
    );
    const best = Math.max(-1, ...matches.map((match) => match.specificity));
    return matches.filter((match) => match.specificity === best).map((match) => match.section);
  }

  function pathFrom(urlOrPath: string) {
    try {
      const url = new URL(urlOrPath, "https://robots.invalid");
      return `${url.pathname}${url.search}`;
    } catch {
      return "/";
    }
  }

  return {
    isAllowed(userAgent, urlOrPath) {
      const path = pathFrom(urlOrPath);
      const matchingRules = matchingSections(userAgent)
        .flatMap((section) => section.rules)
        .filter((rule) => robotsPathMatches(rule.path, path));
      if (matchingRules.length === 0) return true;
      const longest = Math.max(...matchingRules.map((rule) => rule.path.replace(/\$$/, "").length));
      // At equal specificity Allow wins, as required by the robots protocol.
      return matchingRules.some((rule) => rule.allow && rule.path.replace(/\$$/, "").length === longest);
    },
    verdict(userAgent, urlOrPath = "/") {
      const explicit = sections.some((section) =>
        section.agents.some((agent) => agent.toLowerCase() === userAgent.toLowerCase()),
      );
      if (!explicit) return "unmentioned";
      return this.isAllowed(userAgent, urlOrPath) ? "allowed" : "blocked";
    },
  };
}

/** Keep robots evidence relevant to the checkpoint being explained. The full
 * file is still linked, while the stored excerpt contains only the matched
 * user-agent group instead of an arbitrary prefix cut off mid-directive. */
export function robotsEvidenceSnippet(body: string, userAgent: string): string {
  const sections: { agents: string[]; lines: string[] }[] = [];
  let current: { agents: string[]; lines: string[] } | null = null;
  let lastWasAgent = false;
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) {
      lastWasAgent = false;
      continue;
    }
    const agent = line.match(/^user-agent:\s*(.+)$/i);
    if (agent) {
      if (!current || !lastWasAgent) {
        current = { agents: [], lines: [] };
        sections.push(current);
      }
      current.agents.push(agent[1].trim());
      current.lines.push(`User-agent: ${agent[1].trim()}`);
      lastWasAgent = true;
      continue;
    }
    const directive = line.match(/^(allow|disallow|crawl-delay):\s*(.*)$/i);
    if (current && directive) {
      const name = `${directive[1][0].toUpperCase()}${directive[1].slice(1).toLowerCase()}`;
      current.lines.push(`${name}: ${directive[2].trim()}`);
    }
    lastWasAgent = false;
  }

  const product = userAgent.split(/[\s/]/, 1)[0].toLowerCase();
  const exact = sections.filter((section) =>
    section.agents.some((agent) => agent.toLowerCase() === product),
  );
  const matched = exact.length > 0
    ? exact
    : sections.filter((section) => section.agents.some((agent) => agent === "*"));
  if (matched.length === 0) {
    return `No user-agent group mentions ${userAgent.split(/[\s/]/, 1)[0]}; no matching restriction was published.`;
  }

  const excerpt = matched.map((section) => section.lines.join("\n")).join("\n\n").trim();
  if (excerpt.length <= 500) return excerpt;
  return `${excerpt.slice(0, 499).trimEnd()}…`;
}

const ALLOW_ALL_ROBOTS: RobotsPolicy = {
  isAllowed: () => true,
  verdict: () => "unmentioned",
};

async function policyFetch(
  url: string,
  policy: RobotsPolicy,
  ua: string = SCANNER_UA,
  method: "GET" | "HEAD" | "POST" = "GET",
  request?: { headers?: Record<string, string>; body?: string },
): Promise<FetchOutcome> {
  if (!policy.isAllowed(SCANNER_UA, url)) {
    return {
      ok: false,
      status: 0,
      contentType: "",
      body: "",
      finalUrl: url,
      headers: new Headers(),
      error: "Blocked by robots.txt for AgentSurfaceScan.",
    };
  }
  return politeFetch(url, ua, method, request);
}

async function checkD1(origin: string, signals: Signal[], errors: string[]) {
  const now = () => new Date().toISOString();

  // robots.txt — AI-agent directives
  const robots = await politeFetch(`${origin}/robots.txt`);
  const robotsIsText = robots.ok && !looksLikeHtml(robots.body);
  const robotsPolicy = robotsIsText ? parseRobots(robots.body) : ALLOW_ALL_ROBOTS;
  for (const bot of AI_CRAWLERS) {
    signals.push({
      dimension: "D1",
      signalKey: `robots_${bot.toLowerCase().replace(/-/g, "_")}`,
      valueText: robotsIsText ? robotsPolicy.verdict(bot) : "no_robots_txt",
      evidenceUrl: `${origin}/robots.txt`,
      evidenceSnippet: robotsIsText ? robotsEvidenceSnippet(robots.body, bot) : undefined,
      observedAt: now(),
    });
  }

  const scannerAllowed = robotsPolicy.isAllowed(SCANNER_UA, "/");
  signals.push({
    dimension: "D1",
    signalKey: "robots_scanner",
    valueBool: scannerAllowed,
    valueText: robotsIsText ? (scannerAllowed ? "allowed" : "blocked") : "no_robots_txt",
    evidenceUrl: `${origin}/robots.txt`,
    evidenceSnippet: robotsIsText ? robotsEvidenceSnippet(robots.body, SCANNER_UA) : undefined,
    observedAt: now(),
  });

  // llms.txt / llms-full.txt — must parse as text, not a soft-404 HTML page
  const [llms, llmsFull, sitemap, asBot, asBrowser] = await Promise.all([
    policyFetch(`${origin}/llms.txt`, robotsPolicy),
    policyFetch(`${origin}/llms-full.txt`, robotsPolicy),
    policyFetch(`${origin}/sitemap.xml`, robotsPolicy),
    policyFetch(`${origin}/`, robotsPolicy, SCANNER_UA),
    policyFetch(`${origin}/`, robotsPolicy, BROWSER_UA),
  ]);
  for (const [file, r] of [["llms.txt", llms], ["llms-full.txt", llmsFull]] as const) {
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
  if (!scannerAllowed) errors.push("Homepage not fetched because robots.txt blocks AgentSurfaceScan.");
  const transportError = scannerAllowed ? homepageTransportError(asBot, asBrowser) : null;
  if (transportError) throw new Error(`Homepage transport failed: ${transportError}`);
  if (!asBot.ok && !asBrowser.ok)
    errors.push(`Homepage unreachable (${asBot.error ?? asBot.status}).`);

  // Bot-wall detection: a challenge page is not the site. Scoring it as
  // content produced confidently wrong zeros (observed 29 Aug: Cloudflare
  // "Just a moment..." on a 403 served to our production IP).
  const challengeMarkers = /just a moment|attention required|access denied|are you a robot|cf-challenge|_cf_chl|captcha-delivery|px-captcha|incapsula/i;
  const bothBlocked = !scannerAllowed ||
    (!asBot.ok || challengeMarkers.test(asBot.body.slice(0, 3000))) &&
    (!asBrowser.ok || challengeMarkers.test(asBrowser.body.slice(0, 3000)));
  if (bothBlocked) {
    signals.push({
      dimension: "D1",
      signalKey: scannerAllowed ? "agent_access_blocked" : "scanner_access_blocked",
      valueBool: true,
      valueText: scannerAllowed ? `http_${asBot.status}` : "robots_txt",
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
  const visibleText = htmlToVisibleText(html);
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

  return { html, negotiated, types, robotsPolicy };
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

export function discoverPages(origin: string, homepageHtml: string): Map<string, string> {
  const found = new Map<string, string>();
  const hrefs = [...new Set([...homepageHtml.matchAll(/href=["']([^"'#?]+)["']/gi)]
    .flatMap((match) => {
      try {
        const candidate = new URL(match[1], origin);
        if (candidate.origin !== origin || candidate.username || candidate.password) return [];
        candidate.hash = "";
        return [candidate.toString()];
      } catch {
        return [];
      }
    }))];
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

export interface DetectedFormCapability {
  purpose: "appointment" | "checkout" | "application" | "quote" | "contact" | "search" | "newsletter" | "account" | "other";
  sourceUrl: string;
  method: "get" | "post";
  action: string | null;
  provider: string | null;
  submitLabel: string | null;
  fields: { name: string; type: string; required: boolean }[];
}

function attributeValue(attributes: string, name: string): string | null {
  const match = attributes.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:["']([^"']*)["']|([^\\s>]+))`, "i"));
  return (match?.[1] ?? match?.[2] ?? null)?.trim() || null;
}

function hasAttribute(attributes: string, name: string): boolean {
  return new RegExp(`(?:^|\\s)${name}(?:\\s|=|$)`, "i").test(attributes);
}

function formPurpose(haystack: string): DetectedFormCapability["purpose"] {
  if (/book|appointment|schedule|calendar|consultation|meeting/.test(haystack)) return "appointment";
  if (/checkout|cart|payment|purchase|buy[-_\s]?now|order/.test(haystack)) return "checkout";
  if (/apply|application|register|enrol|enroll|admission/.test(haystack)) return "application";
  if (/quote|estimate|proposal|pricing[-_\s]?request/.test(haystack)) return "quote";
  if (/contact|enquir|inquir|message|support|request[-_\s]?call/.test(haystack)) return "contact";
  if (/search|query/.test(haystack)) return "search";
  if (/newsletter|subscribe|mailing[-_\s]?list|updates/.test(haystack)) return "newsletter";
  if (/login|log[-_\s]?in|sign[-_\s]?in|password|account/.test(haystack)) return "account";
  return "other";
}

/** Extract a privacy-safe capability inventory from public forms. Values and
 * hidden fields are never retained; duplicate forms repeated in a site footer
 * collapse to one capability. */
export function extractFormCapabilities(
  pages: { url: string; html: string }[],
): DetectedFormCapability[] {
  const unique = new Map<string, DetectedFormCapability>();
  for (const page of pages) {
    for (const match of page.html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form\s*>/gi)) {
      const attributes = match[1];
      const body = match[2];
      const fields = [...body.matchAll(/<(input|select|textarea)\b([^>]*)>/gi)]
        .flatMap((field) => {
          const attrs = field[2];
          const type = (attributeValue(attrs, "type") ?? field[1]).toLowerCase();
          if (["hidden", "submit", "button", "reset", "image"].includes(type)) return [];
          const name = attributeValue(attrs, "name") ?? attributeValue(attrs, "id") ?? type;
          return [{ name: snippet(name.toLowerCase().replace(/[^a-z0-9_-]+/g, "_"), 60), type, required: hasAttribute(attrs, "required") }];
        })
        .filter((field, index, all) => all.findIndex((other) => other.name === field.name && other.type === field.type) === index)
        .slice(0, 12);
      const submitMatch = body.match(/<button\b[^>]*>([\s\S]*?)<\/button\s*>/i)
        ?? body.match(/<input\b[^>]*type=["']?submit["']?[^>]*value=["']([^"']+)["'][^>]*>/i);
      const submitLabel = submitMatch ? snippet(htmlToVisibleText(submitMatch[1]), 80) || null : null;
      const actionRaw = attributeValue(attributes, "action");
      let action: string | null = null;
      if (actionRaw && !/^javascript:/i.test(actionRaw)) {
        try { action = new URL(actionRaw, page.url).toString(); } catch { action = actionRaw; }
      }
      const context = [attributes, actionRaw, submitLabel, ...fields.map((field) => field.name), htmlToVisibleText(body).slice(0, 240)]
        .filter(Boolean).join(" ").toLowerCase();
      const provider = /hubspot/i.test(context) ? "HubSpot"
        : /salesforce|webtolead/i.test(context) ? "Salesforce"
        : /mailchimp/i.test(context) ? "Mailchimp"
        : /marketo/i.test(context) ? "Marketo"
        : /typeform/i.test(context) ? "Typeform"
        : null;
      const capability: DetectedFormCapability = {
        purpose: formPurpose(context),
        sourceUrl: page.url,
        method: attributeValue(attributes, "method")?.toLowerCase() === "get" ? "get" : "post",
        action,
        provider,
        submitLabel,
        fields,
      };
      const signature = `${capability.purpose}|${fields.map((field) => `${field.name}:${field.type}`).sort().join(",")}|${submitLabel?.toLowerCase() ?? ""}`;
      if (!unique.has(signature)) unique.set(signature, capability);
    }
  }
  return [...unique.values()];
}

async function checkPageSet(
  origin: string,
  homepageHtml: string,
  signals: Signal[],
  robotsPolicy: RobotsPolicy,
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
  const pageDocuments = [{ url: `${origin}/`, html: homepageHtml }];
  const fetchedPages = await Promise.all(
    [...pages].map(async ([type, url]) => ({ type, url, response: await policyFetch(url, robotsPolicy) })),
  );
  for (const { type, url, response: r } of fetchedPages) {
    if (!r.ok) continue;
    scanned.push(url);
    combinedHtml += "\n" + r.body;
    pageDocuments.push({ url, html: r.body });

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

  signals.push(await detectContentLibrary(origin, homepageHtml, robotsPolicy));

  // Signals over everything fetched
  const forms = (combinedHtml.match(/<form[\s>]/gi) ?? []).length;
  signals.push({
    dimension: "D3",
    signalKey: "forms_as_latent_tools",
    valueNum: forms,
    evidenceUrl: `${origin}/`,
    observedAt: now(),
  });

  const formCapabilities = extractFormCapabilities(pageDocuments);
  signals.push({
    dimension: "D3",
    signalKey: "detected_form_capabilities",
    valueNum: formCapabilities.length,
    valueText: JSON.stringify(formCapabilities.slice(0, 10)),
    evidenceUrl: formCapabilities[0]?.sourceUrl ?? `${origin}/`,
    evidenceSnippet: formCapabilities.length > 0
      ? snippet(formCapabilities.map((capability) =>
          `${capability.purpose}: ${capability.fields.map((field) => field.name).join(", ") || "no named fields"}`,
        ).join(" | "))
      : undefined,
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

// Content library — links into knowledge sections, a proxy for "this site
// knows a lot that an agent can only skim". Recorded but not scored in
// v1.0 (scoring it is a rubric-version change); feeds the content-library
// opportunity templates. Exported so the corpus backfill can run it against
// scans that predate the signal.
export async function detectContentLibrary(
  origin: string,
  homepageHtml: string,
  robotsPolicy: RobotsPolicy = ALLOW_ALL_ROBOTS,
): Promise<Signal> {
  const contentLinks = new Set(
    [...homepageHtml.matchAll(/href=["']([^"'#?]+)["']/gi)]
      .map((m) => m[1])
      .filter((href) => {
        try {
          return new URL(href, origin).origin === origin;
        } catch {
          return false;
        }
      })
      .filter((h) =>
        /\/(insights?|blog|guides?|resources?|articles?|knowledge|case-stud|publications?|whitepapers?)(\/|$)/i.test(h),
      ),
  );
  // Most sites expose the library through ONE nav link — follow it and count
  // the articles on the index page itself.
  let libraryCount = contentLinks.size;
  let libraryUrl = `${origin}/`;
  // Derive the section index from any content link — a deep link like
  // /insights/2026/foo still tells us the library lives at /insights.
  const sectionSeg = [...contentLinks]
    .map((h) => {
      try {
        const path = new URL(h, origin).pathname;
        return path.split("/").filter(Boolean).find((seg) =>
          /^(insights?|blog|guides?|resources?|articles?|knowledge|case-studies|publications?|whitepapers?|news)$/i.test(seg),
        );
      } catch {
        return undefined;
      }
    })
    .find(Boolean);
  if (sectionSeg && libraryCount < 8) {
    // The definitive count comes from the sitemap — it lists every URL even
    // when the index page renders its list client-side (observed: a law
    // firm's insights index with zero article links in raw HTML).
    const CONTENT_PATH = /\/(insights?|blog|guides?|resources?|articles?|knowledge|case-studies|publications?|whitepapers?|news)\//i;
    let sitemapBody = (await policyFetch(`${origin}/sitemap.xml`, robotsPolicy)).body;
    if (/<sitemapindex/i.test(sitemapBody)) {
      const children = [...sitemapBody.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)]
        .map((m) => m[1])
        .filter((url) => {
          try {
            return new URL(url, origin).origin === origin;
          } catch {
            return false;
          }
        });
      const preferred = children.find((u) => CONTENT_PATH.test(u)) ?? children[0];
      if (preferred) sitemapBody = (await policyFetch(preferred, robotsPolicy)).body;
    }
    const contentUrls = [...sitemapBody.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)]
      .map((m) => m[1])
      .filter((u) => CONTENT_PATH.test(u));
    if (contentUrls.length > libraryCount) {
      libraryCount = contentUrls.length;
      libraryUrl = `${origin}/sitemap.xml`;
    }
  }
  return {
    dimension: "D2",
    signalKey: "content_library_links",
    valueNum: libraryCount,
    valueText:
      libraryCount >= 8
        ? "substantial_library"
        : sectionSeg
          ? "section_exists_articles_not_enumerable" // nav points at a library, but neither raw pages nor the sitemap list its articles
          : libraryCount > 0
            ? "some_content"
            : "none_detected",
    evidenceUrl: libraryUrl,
    observedAt: new Date().toISOString(),
  };
}

/** Fetch a homepage the way the scanner does — for backfill scripts only. */
export async function fetchHomepageForBackfill(origin: string) {
  const robots = await politeFetch(`${origin}/robots.txt`);
  const robotsPolicy = robots.ok && !looksLikeHtml(robots.body)
    ? parseRobots(robots.body)
    : ALLOW_ALL_ROBOTS;
  return { ...(await policyFetch(`${origin}/`, robotsPolicy)), robotsPolicy };
}

// ---------------------------------------------------------------------------
// Country detection — from what the site itself says, most tangible first:
// its declared address in structured data, then phone country prefix, then a
// UK postcode in the page, then the domain ending. Generic endings (.com,
// .ai, .dev) prove nothing and many UK businesses use them — so the page
// evidence outranks the TLD. Unknown stays unknown.
// ---------------------------------------------------------------------------

const ADDRESS_COUNTRIES: Record<string, string> = {
  gb: "UK", uk: "UK", "united kingdom": "UK", ie: "Ireland", ireland: "Ireland",
  us: "US", usa: "US", "united states": "US", ca: "Canada", canada: "Canada",
  au: "Australia", australia: "Australia", nz: "New Zealand", "new zealand": "New Zealand",
  fr: "France", france: "France", de: "Germany", germany: "Germany",
  it: "Italy", italy: "Italy", es: "Spain", spain: "Spain",
  nl: "Netherlands", netherlands: "Netherlands",
};

const PHONE_PREFIXES: [RegExp, string][] = [
  [/(?:\+|%2B|00)44[\s\d(]/, "UK"],
  [/(?:\+|00)353[\s\d(]/, "Ireland"],
  [/(?:\+|00)61[\s\d(]/, "Australia"],
  [/(?:\+|00)64[\s\d(]/, "New Zealand"],
  [/(?:\+|00)33[\s\d(]/, "France"],
  [/(?:\+|00)49[\s\d(]/, "Germany"],
  [/(?:\+|00)39[\s\d(]/, "Italy"],
  [/(?:\+|00)34[\s\d(]/, "Spain"],
  [/(?:\+|00)31[\s\d(]/, "Netherlands"],
];

const TLD_COUNTRIES: [RegExp, string][] = [
  [/\.uk$/, "UK"], [/\.ie$/, "Ireland"], [/\.fr$/, "France"], [/\.de$/, "Germany"],
  [/\.it$/, "Italy"], [/\.es$/, "Spain"], [/\.nl$/, "Netherlands"], [/\.au$/, "Australia"],
  [/\.nz$/, "New Zealand"], [/\.ca$/, "Canada"], [/\.us$/, "US"],
];

export function detectCountry(html: string | null, domain: string): string | null {
  if (html) {
    const declared = html.match(/"addressCountry"\s*:\s*(?:\{[^}]*"name"\s*:\s*)?"([^"]{2,40})"/i);
    if (declared) {
      const mapped = ADDRESS_COUNTRIES[declared[1].trim().toLowerCase()];
      if (mapped) return mapped;
    }
    for (const [re, country] of PHONE_PREFIXES) if (re.test(html)) return country;
    // UK postcode (outcode + space + incode) — distinctive enough in page text.
    if (/\b[A-Z]{1,2}\d[A-Z\d]?\s\d[A-Z]{2}\b/.test(html)) return "UK";
  }
  const d = domain.toLowerCase();
  return TLD_COUNTRIES.find(([re]) => re.test(d))?.[1] ?? null;
}

// ---------------------------------------------------------------------------
// D3 · Callability — validated probes, never bare status codes
// ---------------------------------------------------------------------------

export function parseJsonRpcBody(body: string): Record<string, unknown> | null {
  const candidates = [body, ...body.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim())];
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      // Try the next SSE data line.
    }
  }
  return null;
}

function sameOriginEndpoint(value: unknown, origin: string): string | null {
  if (typeof value !== "string") return null;
  try {
    const endpoint = new URL(value, origin);
    return endpoint.origin === origin ? endpoint.toString() : null;
  } catch {
    return null;
  }
}

export function endpointsFromDiscovery(value: unknown, origin: string): string[] {
  const found = new Set<string>();
  const visit = (node: unknown, key = "", depth = 0) => {
    if (depth > 5) return;
    if (typeof node === "string" && /(url|endpoint|uri|mcp)/i.test(key)) {
      const endpoint = sameOriginEndpoint(node, origin);
      if (endpoint) found.add(endpoint);
      return;
    }
    if (Array.isArray(node)) return node.forEach((item) => visit(item, key, depth + 1));
    if (node && typeof node === "object") {
      for (const [childKey, child] of Object.entries(node)) visit(child, childKey, depth + 1);
    }
  };
  visit(value);
  return [...found];
}

interface McpHandshake {
  connected: boolean;
  tools: string[];
  error?: string;
}

async function probeMcpEndpoint(endpoint: string, robotsPolicy: RobotsPolicy): Promise<McpHandshake> {
  const commonHeaders = {
    Accept: "application/json, text/event-stream",
    "Content-Type": "application/json",
  };
  const initialize = await policyFetch(endpoint, robotsPolicy, SCANNER_UA, "POST", {
    headers: commonHeaders,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "AgentSurfaceScan", version: "0.1" },
      },
    }),
  });
  const initialized = parseJsonRpcBody(initialize.body);
  const initResult = initialized?.result;
  if (!initialize.ok || !initResult || typeof initResult !== "object") {
    return { connected: false, tools: [], error: initialize.error ?? `initialize_http_${initialize.status}` };
  }

  const session = initialize.headers.get("mcp-session-id");
  const sessionHeaders = session ? { ...commonHeaders, "MCP-Session-Id": session } : commonHeaders;
  await policyFetch(endpoint, robotsPolicy, SCANNER_UA, "POST", {
    headers: sessionHeaders,
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
  });
  const listed = await policyFetch(endpoint, robotsPolicy, SCANNER_UA, "POST", {
    headers: sessionHeaders,
    body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
  });
  const response = parseJsonRpcBody(listed.body);
  const result = response?.result;
  const tools = result && typeof result === "object" && Array.isArray((result as { tools?: unknown }).tools)
    ? (result as { tools: unknown[] }).tools
      .map((tool) => tool && typeof tool === "object" ? (tool as { name?: unknown }).name : undefined)
      .filter((name): name is string => typeof name === "string" && name.length > 0)
    : [];
  if (!listed.ok || !result || typeof result !== "object" || !Array.isArray((result as { tools?: unknown }).tools)) {
    return { connected: true, tools: [], error: listed.error ?? `tools_list_http_${listed.status}` };
  }
  return { connected: true, tools };
}

async function checkD3(
  origin: string,
  homepageHtml: string,
  signals: Signal[],
  robotsPolicy: RobotsPolicy,
  skipRender = false,
): Promise<string[]> {
  const now = () => new Date().toISOString();
  // Discovery has no settled standard — three live drafts, three paths
  // (SEP-1649/2127: mcp.json, SEP-1960: mcp, IETF draft: mcp-server).
  // Probe all of them; one signal records the best answer found.
  const probeGroups: [signalKey: string, paths: string[]][] = [
    ["mcp_probe_well_known", ["/.well-known/mcp.json", "/.well-known/mcp", "/.well-known/mcp-server"]],
    ["mcp_probe_path", ["/mcp"]],
  ];
  const webMCPContexts = skipRender
    ? []
    : discoverWebMCPContexts(origin, homepageHtml)
      .filter((url) => robotsPolicy.isAllowed(SCANNER_UA, url));
  const renderPromise = skipRender ? null : probeWebMCP(webMCPContexts.length > 0 ? webMCPContexts : `${origin}/`);
  const mcpSignals = await Promise.all(probeGroups.map(async ([signalKey, paths]): Promise<Signal> => {
    const discoveries = await Promise.all(paths.map(async (path) => ({ path, response: await policyFetch(`${origin}${path}`, robotsPolicy) })));
    const endpointCandidates = new Set<string>();
    for (const { path, response } of discoveries) {
      if (path === "/mcp") endpointCandidates.add(`${origin}${path}`);
      if (response.ok && !looksLikeHtml(response.body)) {
        try {
          for (const endpoint of endpointsFromDiscovery(JSON.parse(response.body), origin)) endpointCandidates.add(endpoint);
        } catch {
          // A discovery response is only a hint; callability requires the handshake below.
        }
        if (/json|event-stream/i.test(response.contentType) || /"jsonrpc"/.test(response.body)) {
          endpointCandidates.add(`${origin}${path}`);
        }
      }
    }
    const handshakes = await Promise.all([...endpointCandidates].map(async (endpoint) => ({ endpoint, result: await probeMcpEndpoint(endpoint, robotsPolicy) })));
    const best = handshakes.find(({ result }) => result.tools.length > 0) ?? handshakes.find(({ result }) => result.connected);
    const fallbackPath = discoveries.find(({ response }) => response.ok)?.path ?? paths[0];
    return {
      dimension: "D3",
      signalKey,
      valueBool: Boolean(best && best.result.tools.length > 0),
      valueNum: best?.result.tools.length ?? 0,
      valueText: best
        ? best.result.tools.length > 0
          ? `handshake_ok:${best.result.tools.slice(0, 25).join("|")}`
          : `handshake_connected_no_tools${best.result.error ? `:${best.result.error}` : ""}`
        : discoveries.some(({ response }) => response.ok)
          ? "responds_but_handshake_failed"
          : "absent",
      evidenceUrl: best?.endpoint ?? `${origin}${fallbackPath}`,
      observedAt: now(),
    };
  }));
  signals.push(...mcpSignals);
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
    return [];
  }
  const probe = await renderPromise!;
  const classification = classifyWebMCPProbe(probe);
  signals.push({
    dimension: "D3",
    signalKey: "webmcp_registration",
    valueText: classification.verdict,
    valueBool: classification.valueBool,
    evidenceUrl: probe.inventory.contexts[0]?.finalUrl ?? `${origin}/`,
    evidenceSnippet: probe.renderer
      ? [
          `Rendered via ${probe.renderer}${probe.remoteProtocol ? ` (${probe.remoteProtocol})` : ""}`,
          probe.browserVersion,
          probe.protocolDomainAvailable ? "WebMCP protocol available" : "WebMCP protocol unavailable",
          probe.runtimeRegistryAvailable ? "live registry available" : "live registry unavailable",
          `${probe.inventory.contexts.length} context${probe.inventory.contexts.length === 1 ? "" : "s"} scanned`,
          probe.inventory.contextDependent ? "tools vary by page" : undefined,
        ].filter(Boolean).join(" · ")
      : undefined,
    observedAt: now(),
  });
  if (probe.activeToolNames.length > 0) {
    signals.push({
      dimension: "D3",
      signalKey: "webmcp_tools_found",
      valueNum: probe.inventory.totalCount,
      valueText: probe.activeToolNames.slice(0, 100).join("|"),
      evidenceUrl: probe.inventory.contexts[0]?.finalUrl ?? `${origin}/`,
      evidenceSnippet: `Live browser registrations across ${probe.inventory.contexts.length} context${probe.inventory.contexts.length === 1 ? "" : "s"}: ${probe.activeToolNames.slice(0, 25).join(", ")}`,
      observedAt: now(),
    });
    signals.push({
      dimension: "D3",
      signalKey: "webmcp_tool_inventory",
      valueNum: probe.inventory.totalCount,
      valueText: serializeWebMCPInventory(probe.inventory),
      evidenceUrl: probe.inventory.contexts[0]?.finalUrl ?? `${origin}/`,
      observedAt: now(),
    });
  }
  if (probe.blockedRuntimeUrls.length > 0) {
    signals.push({
      dimension: "D3",
      signalKey: "webmcp_runtime_blocked",
      valueNum: probe.blockedRuntimeUrls.length,
      valueText: JSON.stringify(probe.blockedRuntimeUrls),
      evidenceUrl: probe.blockedRuntimeUrls[0],
      evidenceSnippet: "A WebMCP-looking runtime dependency could not be safely loaded, so the live inventory may be incomplete.",
      observedAt: now(),
    });
  }
  if (probe.declaredToolNames.length > 0) {
    signals.push({
      dimension: "D3",
      signalKey: "webmcp_tools_declared",
      valueNum: probe.declaredToolNames.length,
      valueText: probe.declaredToolNames.slice(0, 25).join("|"),
      evidenceUrl: `${origin}/`,
      evidenceSnippet: `Unverified page manifest: ${probe.declaredToolNames.slice(0, 25).join(", ")}`,
      observedAt: now(),
    });
  }
  return probe.inventory.contexts.map((context) => context.finalUrl);
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

export function score(signals: Signal[], cfg: ScoringConfig = REFERENCE_SCORING) {
  // D1 (0-100)
  let d1 = 0;
  const blockedBots = RUBRIC_AI_BOTS.filter(
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
    (sig(signals, "webmcp_tools_found")?.valueNum ?? 0) > 0;
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

  const { html, robotsPolicy } = await checkD1(origin, signals, errors);
  const degraded = signals.some((s) =>
    ["agent_access_blocked", "scanner_access_blocked"].includes(s.signalKey) && s.valueBool,
  );

  if (degraded) {
    // Do not fabricate D2–D5 measurements from a challenge page. What we CAN
    // honestly report: reachability of the text files, robots verdicts, and
    // the block itself — which for an agent is the finding.
    const startedSignals = signals.filter((s) =>
      ["robots_", "llms_", "sitemap_xml", "agent_access_blocked", "scanner_access_blocked"].some((p) => s.signalKey.startsWith(p)),
    );
    signals.length = 0;
    signals.push(...startedSignals);
    await checkD3(origin, "", signals, robotsPolicy, true); // fixed-path probes only; no render on a walled site
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
      errors: [...errors, "Scan degraded: robots.txt or the site itself denied our scanner access. Unmeasured dimensions are reported as unmeasured, not zero."],
      degraded: true,
      countryGuess: detectCountry(null, domain), // a challenge page proves nothing about location
    };
  }

  const pageSignals: Signal[] = [];
  const d3Signals: Signal[] = [];
  const [pagesScanned, webMCPPages] = await Promise.all([
    checkPageSet(origin, html, pageSignals, robotsPolicy),
    checkD3(origin, html, d3Signals, robotsPolicy),
  ]);
  signals.push(...pageSignals, ...d3Signals);

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
    pagesScanned: [...new Set([...pagesScanned, ...webMCPPages])],
    errors,
    degraded: false,
    countryGuess: detectCountry(html, domain),
  };
}
