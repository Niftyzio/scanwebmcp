/**
 * "Through the agent's eyes" — the translation layer from signals to
 * consequences. Generates a simulated buyer→assistant exchange TWICE:
 * as it goes today (built strictly from observed signals, each line carrying
 * the signal it rests on), and as it could go if the scan's opportunities
 * were taken. Deterministic templates only — nothing is invented, every
 * "today" line is traceable to evidence on the same page.
 */

export interface DialogueLine {
  ok: boolean | null; // true ✓, false ✗, null = neutral
  text: string;
  signalKey?: string; // anchors to the evidence block
}

export interface AgentView {
  buyerAsk: string;
  today: DialogueLine[];
  withTools: DialogueLine[];
}

type SignalLike = {
  signal_key?: string;
  signalKey?: string;
  value_bool?: boolean | null;
  valueBool?: boolean;
  value_num?: number | null;
  valueNum?: number;
  value_text?: string | null;
  valueText?: string;
};

export function buildAgentView(domain: string, signalsIn: SignalLike[]): AgentView {
  const get = (key: string) => {
    const s = signalsIn.find((x) => (x.signal_key ?? x.signalKey) === key);
    if (!s) return undefined;
    return {
      bool: s.value_bool ?? s.valueBool ?? undefined,
      num: s.value_num ?? s.valueNum ?? undefined,
      text: s.value_text ?? s.valueText ?? undefined,
    };
  };

  const blockedBots = ["gptbot", "claudebot", "google_extended", "perplexitybot"].filter(
    (b) => get(`robots_${b}`)?.text === "blocked",
  );
  const readable = get("content_without_js")?.bool === true;
  const negotiated = get("agent_content_negotiation")?.bool === true;
  const llms = get("llms_txt")?.bool === true;
  const sdTypes = String(get("structured_data_types")?.text ?? "none");
  const sellsMarkup = /Service|Offer|Product/i.test(sdTypes);
  const pricingFound = get("pricing_page_locatable")?.bool === true;
  const pricesSpecific = get("price_specificity")?.bool === true;
  const faqAnswers = get("faq_coverage")?.bool === true || get("faq_page_locatable")?.bool === true;
  const forms = Number(get("forms_as_latent_tools")?.num ?? 0);
  const booking = get("booking_embed")?.bool === true;
  const callable = get("mcp_probe_well_known")?.bool === true || get("mcp_probe_path")?.bool === true;
  const webmcpTools = Number(get("webmcp_tools_found")?.num ?? 0);
  const contact = String(get("contact_affordances")?.text ?? "none_detected");

  const today: DialogueLine[] = [];

  // Degraded scan — the wall is the whole story; invent nothing beyond it.
  if (get("agent_access_blocked")?.bool === true || get("scanner_access_blocked")?.bool === true) {
    const deniedByRobots = get("scanner_access_blocked")?.bool === true;
    today.push({
      ok: false,
      text: deniedByRobots
        ? `I couldn't inspect ${domain}: its published robots.txt rules explicitly denied this scanner, so I stopped. Everything else is unmeasured rather than guessed.`
        : `I couldn't see ${domain} at all. Their security system decided I was a robot — which I am — and showed me a challenge page instead of their site. Everything you asked me, I'd have to answer from other sources or not at all.`,
      signalKey: deniedByRobots ? "scanner_access_blocked" : "agent_access_blocked",
    });
    if (blockedBots.length > 0) {
      today.push({
        ok: false,
        text: `Their robots.txt separately tells AI crawlers to stay away, so this looks like policy, not accident.`,
        signalKey: "robots_gptbot",
      });
    }
    return {
      buyerAsk: `Find me a business like ${domain}, tell me what they'd charge for someone like me, and get me booked in if they're good.`,
      today,
      withTools: [
        { ok: true, text: `Their site lets verified assistants through the firewall, so I can actually read who they are and who they serve.` },
        { ok: true, text: `From there, published terms and a callable enquiry tool would take them the rest of the way — but the wall comes down first.` },
        { ok: null, text: `One firewall rule stands between them and every buyer who shops through an assistant.` },
      ],
    };
  }

  // Beat 1 — can I even see them?
  if (blockedBots.length >= 3) {
    today.push({
      ok: false,
      text: `I couldn't read ${domain} at all — their robots.txt tells assistants like me to stay out. I can only pass you the link and my best guess from elsewhere.`,
      signalKey: "robots_gptbot",
    });
  } else if (!readable) {
    today.push({
      ok: false,
      text: `Their pages arrive nearly empty for me — the content only exists after scripts run, so I'm describing them from fragments.`,
      signalKey: "content_without_js",
    });
  } else {
    today.push({
      ok: true,
      text: negotiated
        ? `I can read them very well — they even serve assistants a clean, agent-friendly version of their pages. That's rare.`
        : llms
          ? `I can read them, and they've published a summary written for assistants like me — so I can describe them in their own words.`
          : `I can read their pages and work out what they do.`,
      signalKey: negotiated ? "agent_content_negotiation" : llms ? "llms_txt" : "content_without_js",
    });
  }

  // Beat 2 — can I answer your real questions?
  if (pricesSpecific) {
    today.push({ ok: true, text: `They publish figures, so I can tell you what things cost and compare them for you.`, signalKey: "price_specificity" });
  } else if (pricingFound) {
    today.push({
      ok: false,
      text: `They have a pricing page, but there's nothing on it I can quote — so when you ask "what would they charge me?", my honest answer is "they don't say." Firms that publish even a starting price win this comparison by default.`,
      signalKey: "price_specificity",
    });
  } else {
    today.push({
      ok: false,
      text: `You asked what they charge — I can't find prices anywhere from their navigation. I can't compare what I can't quantify, so they drop out of any shortlist sorted by value.`,
      signalKey: "pricing_page_locatable",
    });
  }
  if (!faqAnswers) {
    today.push({
      ok: false,
      text: `Your practical questions — "do they handle cases like mine? how fast could they start?" — have no written answers I can find. I'd be guessing, so I won't.`,
      signalKey: "faq_page_locatable",
    });
  }
  if (sellsMarkup) {
    today.push({ ok: true, text: `Their services are machine-readable, so I can match what they offer against what you need without guessing.`, signalKey: "structured_data_types" });
  }

  // Beat 3 — can I act for you?
  if (callable || webmcpTools > 0) {
    today.push({
      ok: true,
      text: webmcpTools > 0
        ? `And here's the unusual part: they expose ${webmcpTools} tool${webmcpTools > 1 ? "s" : ""} I can actually use — I can act on their site for you, not just read it.`
        : `They expose a callable endpoint — I may be able to act for you directly rather than sending you to a form.`,
      signalKey: webmcpTools > 0 ? "webmcp_tools_found" : "mcp_probe_well_known",
    });
  } else {
    const ending =
      booking
        ? `They have online booking, but it's built for human hands — I can't operate it for you. I'll send you the link; the clicking is yours.`
        : contact === "phone_only"
          ? `The only way in is a phone number. I can't ring anyone. This is where I stop and you take over entirely.`
          : forms > 0
            ? `To actually reach them, there's a form — which I can see but not submit on your behalf. So this ends with me handing you a link and hoping you have time later.`
            : `I found no way to act on your behalf at all — no booking, no form, nothing callable. You're on your own from here.`;
    today.push({
      ok: false,
      text: ending,
      signalKey: booking ? "booking_embed" : forms > 0 ? "forms_as_latent_tools" : "contact_affordances",
    });
  }

  // The counterfactual — the same ask if the opportunities were taken.
  const withTools: DialogueLine[] = [
    {
      ok: true,
      text: llms || readable
        ? `I can read them, and their agent summary tells me exactly who they serve — you fit.`
        : `Their site now reads cleanly, and their agent summary tells me exactly who they serve — you fit.`,
    },
    {
      ok: true,
      text: `They publish their terms: engagements from a stated price band, and written answers to the questions you'd ask. I can compare them properly — and they compare well.`,
    },
    {
      ok: true,
      text:
        forms > 0 || booking
          ? `Their ${booking ? "booking flow" : "enquiry form"} is exposed as a tool, so I've already scoped your requirements with it${booking ? " and I'm holding Tuesday 2pm" : " and your enquiry is in their queue"} — you just confirm.`
          : `They expose a scoping tool, so I've already submitted your requirements — you just confirm.`,
    },
    {
      ok: null,
      text: `Total effort from you: one "yes."`,
    },
  ];

  return {
    buyerAsk: `Find me a business like ${domain}, tell me what they'd charge for someone like me, and get me booked in if they're good.`,
    today,
    withTools,
  };
}
