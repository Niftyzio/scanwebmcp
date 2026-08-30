/**
 * Plain-English layer over the signal engine. Everything user-facing reads
 * from here; raw signal keys and value_text codes stay machine-facing. This
 * doubles as the abstraction boundary: the page explains what was observed
 * and what it means, never how it is scored (spec tone rules; IP boundary —
 * scoring internals are not disclosed).
 *
 * Copy is draft — awaiting Sara's voice pass.
 */

export const DIMENSIONS: Record<
  string,
  { name: string; question: string; gloss: string }
> = {
  D1: {
    name: "Legibility",
    question: "Can agents read you?",
    gloss:
      "Whether an AI assistant that visits your site gets real content it can read — or a wall, an empty page, or a guess.",
  },
  D2: {
    name: "Answerability",
    question: "Can agents answer a buyer's questions about you?",
    gloss:
      "When a buyer asks their assistant what you offer, what it costs, and whether you fit — are the answers published where an agent can find them?",
  },
  D3: {
    name: "Callability",
    question: "Can agents act on your site?",
    gloss:
      "Whether anything on your site is a capability an assistant can actually use — book, enquire, check — rather than a page it can only look at.",
  },
  D4: {
    name: "Transactability",
    question: "Can an enquiry actually reach you?",
    gloss:
      "How far an assistant can carry a warm buyer towards you before a human has to take over — and what stands in the way.",
  },
  D5: {
    name: "Standing",
    question: "Does the wider web know who you are?",
    gloss:
      "Whether machines can tell, unambiguously, what kind of business you are and who is behind it.",
  },
};

interface SignalMeta {
  label: string; // plain name shown on the page
  plain: string; // one-line "what this checks", user-facing
}

export const SIGNALS: Record<string, SignalMeta> = {
  // D1
  agent_access_blocked: {
    label: "Security wall met our agent",
    plain:
      "When our scanner arrived as an automated visitor, the site's security system served a challenge page instead of content. Every AI assistant a buyer sends gets the same treatment.",
  },
  scanner_access_blocked: {
    label: "robots.txt denied this scan",
    plain: "The site's published crawler rules explicitly denied AgentSurfaceScan, so we stopped instead of reading disallowed pages.",
  },
  robots_scanner: {
    label: "Access for this scanner",
    plain: "Whether robots.txt allows AgentSurfaceScan to fetch the page being measured.",
  },
  robots_gptbot: {
    label: "OpenAI training crawler (GPTBot)",
    plain: "Whether robots.txt permits OpenAI's crawler for potential model-training use. This is separate from ChatGPT search and user-requested visits.",
  },
  robots_oai_searchbot: {
    label: "ChatGPT search crawler (OAI-SearchBot)",
    plain: "Whether robots.txt permits the crawler OpenAI uses to surface sites in ChatGPT search answers.",
  },
  robots_claudebot: {
    label: "Anthropic training crawler (ClaudeBot)",
    plain: "Whether robots.txt permits Anthropic's crawler for potential model-training use. This is separate from Claude search and user-requested visits.",
  },
  robots_claude_searchbot: {
    label: "Claude search crawler (Claude-SearchBot)",
    plain: "Whether robots.txt permits the crawler Anthropic uses to improve links and citations in Claude search results.",
  },
  robots_google_extended: {
    label: "Google AI-use control (Google-Extended)",
    plain: "Whether Google may use crawled content for Gemini training and grounding. It is a robots product token, not a separate crawler, and does not control Google Search inclusion.",
  },
  robots_perplexitybot: {
    label: "Perplexity search crawler",
    plain: "Whether robots.txt permits PerplexityBot to index content for Perplexity search results. Perplexity documents that it is not used for foundation-model training.",
  },
  llms_txt: {
    label: "Summary written for AI (llms.txt)",
    plain:
      "A plain-text page at a fixed address that tells AI systems what you do, in your words rather than their guesses.",
  },
  llms_full_txt: {
    label: "Extended AI summary (llms-full.txt)",
    plain: "The longer companion file — your full site content in one AI-readable page.",
  },
  sitemap_xml: {
    label: "Sitemap",
    plain: "The index file that lets agents list every page you publish.",
  },
  content_without_js: {
    label: "Content readable without scripts",
    plain:
      "Whether your pages carry their content in the page itself. Many agents read the raw page and never run scripts — if the content only appears after scripts run, they see an empty shell.",
  },
  agent_content_negotiation: {
    label: "Agent-tailored pages",
    plain:
      "Whether the site serves a cleaner, agent-friendly version of its pages when an AI identifies itself. Rare today — a differentiator.",
  },
  structured_data_types: {
    label: "Machine-readable markup",
    plain:
      "Schema markup is the machine-readable version of who you are and what you sell — the difference between an agent reading your proposition and inferring it.",
  },
  title_meta_coherence: {
    label: "Titles match the content",
    plain: "Whether your page titles and descriptions describe what is actually on the page.",
  },

  // D2
  services_page_locatable: {
    label: "Services page",
    plain: "Can an agent find, from your navigation, a page that says what you offer?",
  },
  pricing_page_locatable: {
    label: "Pricing page",
    plain:
      "Can an agent find a page about what you charge? Agents recommend what they can compare — and they can't compare what they can't find.",
  },
  price_specificity: {
    label: "Quotable prices",
    plain:
      "Whether the pricing page carries figures an agent can actually quote to a buyer — a number, a band, a worked example.",
  },
  faq_page_locatable: {
    label: "FAQ page",
    plain:
      "Can an agent find written answers to the practical questions buyers ask about you?",
  },
  faq_coverage: {
    label: "FAQ substance",
    plain: "Whether the FAQ page carries real questions and answers an agent can lift.",
  },
  content_library_links: {
    label: "Knowledge library",
    plain:
      "Articles, insights and guides an agent can list and cite. A library an agent can read answers a buyer's question with your name on it.",
  },

  // D3
  forms_as_latent_tools: {
    label: "Forms (capabilities-in-waiting)",
    plain:
      "Every form is a capability waiting to be exposed: the same fields, registered as a tool, let an assistant complete the enquiry on a buyer's behalf — with their confirmation.",
  },
  detected_form_capabilities: {
    label: "Distinct form capabilities",
    plain:
      "A privacy-safe inventory of the public forms observed across scanned pages: purpose, field names and types, action route, and provider where identifiable. Field values and hidden fields are never retained.",
  },
  booking_embed: {
    label: "Online booking",
    plain:
      "An embedded scheduling tool — today built for human hands, but the fastest existing capability to make agent-callable.",
  },
  mcp_probe_well_known: {
    label: "MCP endpoint (standard address)",
    plain:
      "Whether the site answers at the standard address where agents look for callable capabilities.",
  },
  mcp_probe_path: {
    label: "MCP endpoint (common path)",
    plain: "A second standard location agents check for callable capabilities.",
  },
  webmcp_registration: {
    label: "WebMCP runtime check",
    plain: "Whether a rendered browser witnessed tools being registered. A manifest or source-code pattern is recorded separately but is not treated as working.",
  },
  webmcp_tools_found: {
    label: "WebMCP tools working",
    plain: "How many distinct live tool registrations the browser observed across the relevant pages it safely visited.",
  },
  webmcp_runtime_blocked: {
    label: "WebMCP runtime dependency blocked",
    plain: "A script that appears to provide WebMCP could not be loaded inside the scanner's safety boundary. The result may be incomplete and is not treated as zero.",
  },
  webmcp_tool_inventory: {
    label: "WebMCP tool inventory",
    plain: "Structured evidence for the live tools, their page context and their observed agent-facing descriptions.",
  },
  webmcp_tools_declared: {
    label: "WebMCP tools declared (unverified)",
    plain: "Names advertised by a page manifest. This helps discovery but does not prove that an agent can call them.",
  },

  // D4
  contact_page_locatable: {
    label: "Contact page",
    plain: "Can an agent find how to reach you from your navigation?",
  },
  about_page_locatable: {
    label: "About page",
    plain: "Can an agent find who you are from your navigation?",
  },
  contact_affordances: {
    label: "Ways to reach you",
    plain:
      "What paths exist for an assistant to route a warm enquiry to you. An agent can use an email address or a form; it cannot ring a phone number.",
  },
  friction_captcha: {
    label: "CAPTCHA on the path",
    plain:
      "Whether a prove-you're-human test stands between an assistant and your forms. It stops the agents your buyers send along with the bots.",
  },

  // D5
  entity_clarity: {
    label: "Who you are, machine-readably",
    plain:
      "Whether markup states plainly what kind of organisation this is and who is behind it — so agents describe you accurately instead of guessing.",
  },
};

/** Plain reading of a stored signal value. Falls back to a tidied raw value. */
export function describeSignalValue(
  key: string,
  v: { bool?: boolean | null; num?: number | null; text?: string | null },
): string {
  const { bool, num, text } = v;
  switch (key) {
    case "agent_access_blocked":
      return text === "http_429"
        ? "rate-limited — the site asked our agent to go away and come back never"
        : "a challenge page was served instead of content";
    case "scanner_access_blocked":
      return "robots.txt explicitly denied this scanner";
    case "robots_scanner":
      return bool ? "this scanner is allowed" : "this scanner is blocked";
    case "robots_gptbot":
    case "robots_oai_searchbot":
    case "robots_claudebot":
    case "robots_claude_searchbot":
    case "robots_google_extended":
    case "robots_perplexitybot":
      return text === "blocked"
        ? "told to stay out"
        : text === "allowed"
          ? "explicitly welcomed"
          : "not mentioned — treated as allowed";
    case "content_without_js":
      return bool
        ? "content arrives in the page itself"
        : "pages arrive nearly empty until scripts run";
    case "structured_data_types":
      return text && text !== "none"
        ? `found: ${text.split("|").join(", ")}`
        : "none found";
    case "price_specificity":
      switch (text) {
        case "specific_prices": return "figures an agent can quote";
        case "contact_for_pricing_only": return "“contact us for pricing” is all an agent finds";
        case "prices_present_but_gated_copy": return "figures present, but wrapped in contact-us copy";
        default: return "no quotable figures observed";
      }
    case "faq_coverage":
      return text === "faqpage_markup"
        ? "machine-readable FAQ markup present"
        : `${num ?? 0} written question${num === 1 ? "" : "s"} found`;
    case "content_library_links":
      switch (text) {
        case "substantial_library": return `${num} articles an agent can list`;
        case "section_exists_articles_not_enumerable":
          return "a library section exists, but agents can't list what's in it";
        case "some_content": return `${num} article link${num === 1 ? "" : "s"} found`;
        default: return "no library detected";
      }
    case "forms_as_latent_tools":
      return `${num ?? 0} form${num === 1 ? "" : "s"} found`;
    case "detected_form_capabilities":
      return `${num ?? 0} distinct public form capabilit${num === 1 ? "y" : "ies"} mapped`;
    case "contact_affordances":
      switch (text) {
        case "email_and_form": return "email and form — agents have a path in";
        case "email": return "email — agents have a path in";
        case "form_only": return "a form (readable, not yet submittable by agents)";
        case "phone_only": return "phone only — agents cannot ring";
        default: return "none observed";
      }
    case "friction_captcha":
      return bool ? "a CAPTCHA guards interaction" : "no CAPTCHA in the way";
    case "entity_clarity":
      switch (text) {
        case "org_and_people": return "organisation and people, both machine-readable";
        case "org_only": return "organisation stated, people not";
        default: return "no machine-readable identity found";
      }
    case "webmcp_tools_found":
      return `${num ?? 0} live registration${num === 1 ? "" : "s"} observed`;
    case "webmcp_tools_declared":
      return `${num ?? 0} tool name${num === 1 ? "" : "s"} declared, not verified callable`;
    case "webmcp_runtime_blocked":
      return `${num ?? 0} WebMCP-looking runtime dependenc${num === 1 ? "y" : "ies"} could not be safely loaded — inventory may be incomplete`;
    case "webmcp_registration":
      if (text?.startsWith("render_unavailable"))
        return "couldn't be checked this time — the renderer was unavailable, so this is unmeasured, not counted against you";
      if (text?.startsWith("runtime_witness_unavailable"))
        return "the page rendered, but this browser could not witness WebMCP registrations — unmeasured, not counted against you";
      if (text === "render_skipped_degraded_scan")
        return "not checked — the site's wall stopped the scan before this step";
      switch (text) {
        case "active_tools_found": return "live tools found — agents can use this site";
        case "manifest_declared_unverified": return "a manifest is declared, but no live registrations were observed";
        case "registration_code_unverified": return "registration-looking source code is present, but no live registrations were observed";
        default: return "none found";
      }
  }
  // Locatable pages and remaining booleans share one shape.
  if (key.endsWith("_page_locatable"))
    return bool ? "found from the navigation" : "not discoverable from the navigation";
  if (bool != null) return bool ? "found" : "not found";
  if (num != null) return String(num);
  return (text ?? "").replace(/_/g, " ") || "—";
}

export function signalLabel(key: string): string {
  return SIGNALS[key]?.label ?? key.replace(/_/g, " ");
}
export function signalPlain(key: string): string | null {
  return SIGNALS[key]?.plain ?? null;
}
