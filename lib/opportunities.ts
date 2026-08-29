/**
 * Opportunity templates — every finding is written as an opportunity, not a
 * defect (spec tone rules: present tense on evidence, future tense on upside,
 * no fear framing, no score shaming). Exactly three are chosen per scan,
 * ranked by impact × ease.
 */
import type { ScanResult, Signal } from "./engine";

export interface Opportunity {
  templateKey: string;
  rank: number;
  impact: number; // 1-5
  ease: number; // 1-5
  title: string;
  text: string;
}

const sig = (r: ScanResult, key: string): Signal | undefined =>
  r.signals.find((s) => s.signalKey === key);

interface Template {
  key: string;
  impact: number;
  ease: number;
  applies: (r: ScanResult) => boolean;
  title: (r: ScanResult) => string;
  text: (r: ScanResult) => string;
}

const TEMPLATES: Template[] = [
  {
    key: "firewall_blocks_agents",
    impact: 5,
    ease: 4,
    applies: (r) => sig(r, "agent_access_blocked")?.valueBool === true,
    title: () => "Your security wall is turning away the agents your buyers send",
    text: () =>
      `When our scanner visited as an automated agent, your site served a bot-challenge page instead of content — and what happened to us happens to every AI assistant a potential client sends your way. The fix is usually one firewall rule: allow verified AI crawlers and agents (most WAFs, including Cloudflare, now have a one-toggle setting for this) while keeping protection for everything else.`,
  },
  {
    key: "unblock_agents",
    impact: 5,
    ease: 5,
    applies: (r) =>
      ["robots_gptbot", "robots_claudebot", "robots_google_extended", "robots_perplexitybot"].some(
        (k) => sig(r, k)?.valueText === "blocked",
      ),
    title: () => "You are one file-edit away from being visible to AI agents",
    text: (r) => {
      const blocked = ["GPTBot", "ClaudeBot", "Google-Extended", "PerplexityBot"].filter(
        (b) => sig(r, `robots_${b.toLowerCase().replace(/-/g, "_")}`)?.valueText === "blocked",
      );
      return `Your robots.txt currently tells ${blocked.join(", ")} not to read your site. These are the crawlers behind the AI assistants your future clients already ask for recommendations. Removing those directives is a five-minute change to one text file — and it moves you out of the Invisible rung immediately.`;
    },
  },
  {
    key: "forms_are_latent_tools",
    impact: 4,
    ease: 4,
    applies: (r) => (sig(r, "forms_as_latent_tools")?.valueNum ?? 0) > 0,
    title: (r) =>
      `Your ${sig(r, "forms_as_latent_tools")!.valueNum} form${(sig(r, "forms_as_latent_tools")!.valueNum ?? 0) > 1 ? "s are" : " is"} already ${(sig(r, "forms_as_latent_tools")!.valueNum ?? 0) > 1 ? "" : "a "}callable capabilit${(sig(r, "forms_as_latent_tools")!.valueNum ?? 0) > 1 ? "ies" : "y"} — unexposed`,
    text: (r) =>
      `We found ${sig(r, "forms_as_latent_tools")!.valueNum} form(s) across your scanned pages. Every form is a tool with a schema waiting to be written: the same fields, exposed as a registered tool, let an assistant complete an enquiry or booking on a client's behalf — with their confirmation — instead of hoping they fill it in later. ChatGPT's desktop browser executes such tools today.`,
  },
  {
    key: "publish_llms_txt",
    impact: 3,
    ease: 5,
    applies: (r) => !sig(r, "llms_txt")?.valueBool,
    title: () => "An agent-facing summary file would take an afternoon",
    text: () =>
      `There is no llms.txt on your site — the plain-text file that tells AI systems what you do, in your words rather than their guesses. It is one page of text at a fixed address. Most of your sector doesn't have one either, which is precisely why having one gets you quoted accurately while others get paraphrased.`,
  },
  {
    key: "price_legibility",
    impact: 5,
    ease: 3,
    applies: (r) =>
      sig(r, "pricing_page_locatable")?.valueBool === false ||
      sig(r, "price_specificity")?.valueBool === false,
    title: (r) =>
      sig(r, "pricing_page_locatable")?.valueBool === false
        ? "An agent looking for your prices cannot find them"
        : "Your pricing page gives an agent nothing to quote",
    text: (r) =>
      sig(r, "pricing_page_locatable")?.valueBool === false
        ? `From your homepage navigation, no pricing page is discoverable. Agents recommend what they can quantify: a published price band — even "engagements from £X" — makes you comparable, and comparable is recommendable.`
        : `Your pricing page exists but carries no figures an agent can lift (${sig(r, "price_specificity")?.valueText === "contact_for_pricing_only" ? `"contact us for pricing" is all an agent finds` : "no specific prices were observed"}). A price band or worked example turns "we couldn't say" into an answer with your name on it.`,
  },
  {
    key: "structured_data_depth",
    impact: 3,
    ease: 3,
    applies: (r) => {
      const s = sig(r, "structured_data_types");
      if (!s) return false; // not measured (degraded scan) — never claim it's missing
      return !/Service|Offer|Product|FAQPage/.test(s.valueText ?? "");
    },
    title: () => "Your markup says who you are, not what you sell",
    text: (r) => {
      const t = sig(r, "structured_data_types")?.valueText ?? "none";
      return t === "none"
        ? `Your pages carry no structured data at all. Schema markup (Organization, Service, Offer, FAQPage) is the machine-readable version of your proposition — the difference between an agent inferring what you do and reading it.`
        : `Your structured data covers ${t.split("|").slice(0, 3).join(", ")} — identity, not offering. Adding Service and Offer markup lets an agent read your services and terms directly instead of inferring them from prose.`;
    },
  },
  {
    key: "expose_booking",
    impact: 4,
    ease: 3,
    applies: (r) => sig(r, "booking_embed")?.valueBool === true,
    title: () => "Your booking flow is already a callable capability",
    text: () =>
      `You run an embedded scheduling tool. Exposed as a registered tool, an assistant could check availability and hold a slot on a client's behalf — with the client confirming, not typing. This is typically the fastest route from Readable to Transactable, because the capability already works.`,
  },
  {
    key: "faq_coverage",
    impact: 3,
    ease: 4,
    applies: (r) =>
      sig(r, "faq_page_locatable")?.valueBool === false && sig(r, "faq_coverage")?.valueBool !== true,
    title: () => "The questions agents get asked about you have no written answers",
    text: () =>
      `No FAQ page is discoverable from your navigation. When an assistant is asked "do they work with companies like mine?" or "how fast can they start?", it answers from whatever it can find — or declines. A page of direct answers, in your words, is the cheapest way to control what agents say about you.`,
  },
  {
    key: "phone_only_contact",
    impact: 4,
    ease: 4,
    applies: (r) => sig(r, "contact_affordances")?.valueText === "phone_only",
    title: () => "Phone-only contact is invisible to agents",
    text: () =>
      `The only way to reach you that we could observe is a phone number. An agent cannot ring you. An email address or a simple form gives assistants a path to route a warm enquiry to you — today that path doesn't exist.`,
  },
  {
    key: "next_rung_callable",
    impact: 5,
    ease: 2,
    applies: (r) =>
      r.rung >= 1 && !sig(r, "mcp_probe_well_known")?.valueBool && !sig(r, "mcp_probe_path")?.valueBool,
    title: () => "Nothing on your site is callable yet — and almost nobody else's is either",
    text: () =>
      `No MCP endpoint or registered tool surface was found. That is normal: callability is the empty column across nearly every sector we scan. Which is the opportunity — the first firm in a sector to expose even one capability (a scoping call, a quote, an eligibility check) becomes the one assistants can actually transact with.`,
  },
];

export function pickOpportunities(r: ScanResult): Opportunity[] {
  return TEMPLATES.filter((t) => t.applies(r))
    .sort((a, b) => b.impact * b.ease - a.impact * a.ease)
    .slice(0, 3)
    .map((t, i) => ({
      templateKey: t.key,
      rank: i + 1,
      impact: t.impact,
      ease: t.ease,
      title: t.title(r),
      text: t.text(r),
    }));
}
