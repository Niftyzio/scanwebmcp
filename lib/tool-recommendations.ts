import type { DetectedFormCapability } from "./engine";

export interface ToolSignal {
  signal_key: string;
  value_bool: boolean | null;
  value_num: number | null;
  value_text: string | null;
  evidence_url: string;
}

export interface ToolRecommendation {
  name: string;
  label: string;
  description: string;
  inputs: string[];
  output: string;
  confirmation: "Required before action" | "Not required — read only";
  businessValue: number;
  effort: number;
  confidence: "High" | "Medium";
  evidenceSignalKey: string;
  evidenceUrl: string;
  evidence: string;
  basis?: "Observed capability" | "Observed gap";
}

const find = (signals: ToolSignal[], key: string) => signals.find((signal) => signal.signal_key === key);

function parsedForms(signals: ToolSignal[]): DetectedFormCapability[] {
  const raw = find(signals, "detected_form_capabilities")?.value_text;
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is DetectedFormCapability =>
      Boolean(item && typeof item === "object" && "purpose" in item && "sourceUrl" in item),
    );
  } catch {
    return [];
  }
}

const formCopy: Record<DetectedFormCapability["purpose"], {
  name: string;
  label: string;
  description: string;
  output: string;
  value: number;
  effort: number;
}> = {
  appointment: {
    name: "request_appointment",
    label: "Let an agent request an appointment",
    description: "Turn the existing appointment form into a tool an assistant can prepare and submit after the buyer confirms.",
    output: "A confirmed request reference and next-step message",
    value: 5,
    effort: 3,
  },
  checkout: {
    name: "start_checkout",
    label: "Let an agent start checkout",
    description: "Expose the existing purchase path so an assistant can prepare an order and hand the final confirmation to the buyer.",
    output: "A reviewable checkout session or order summary",
    value: 5,
    effort: 4,
  },
  application: {
    name: "submit_application",
    label: "Let an agent prepare an application",
    description: "Reuse the public application fields as a structured tool, with the final submission kept behind human confirmation.",
    output: "An application reference and status instructions",
    value: 5,
    effort: 4,
  },
  quote: {
    name: "request_quote",
    label: "Let an agent request a quote",
    description: "Turn the quote form into a structured action an assistant can complete with the buyer instead of sending them away to retype it.",
    output: "A quote-request reference and expected response time",
    value: 5,
    effort: 3,
  },
  contact: {
    name: "send_enquiry",
    label: "Let an agent send a qualified enquiry",
    description: "Expose the existing contact path as a tool so an assistant can carry buyer context into the enquiry after confirmation.",
    output: "An enquiry reference and clear next step",
    value: 4,
    effort: 3,
  },
  search: {
    name: "search_site",
    label: "Let an agent search the site directly",
    description: "Expose the existing search capability with structured results so assistants can find the right page in one call.",
    output: "Ranked results with titles, summaries and source URLs",
    value: 3,
    effort: 2,
  },
  newsletter: {
    name: "subscribe_updates",
    label: "Let an agent prepare a subscription",
    description: "Make the existing updates form callable while keeping consent explicit and controlled by the human.",
    output: "A pending subscription or confirmation message",
    value: 2,
    effort: 2,
  },
  account: {
    name: "start_account_access",
    label: "Give agents a safe account hand-off",
    description: "Create a structured, non-credential tool that starts the existing account journey and returns a secure hand-off URL.",
    output: "A secure sign-in or account-start hand-off",
    value: 3,
    effort: 4,
  },
  other: {
    name: "submit_enquiry",
    label: "Turn a public form into an agent tool",
    description: "The form already defines a usable input schema. Registering it as a tool would let an assistant prepare the action for human confirmation.",
    output: "A submission reference and next-step message",
    value: 3,
    effort: 3,
  },
};

function fromForm(form: DetectedFormCapability): ToolRecommendation {
  const copy = formCopy[form.purpose];
  const inputs = form.fields
    .filter((field) => field.type !== "password")
    .map((field) => `${field.name}${field.required ? " (required)" : ""}`)
    .slice(0, 6);
  return {
    ...copy,
    inputs: inputs.length > 0 ? inputs : ["Buyer details", "Request context"],
    confirmation: "Required before action",
    businessValue: copy.value,
    confidence: "High",
    evidenceSignalKey: "detected_form_capabilities",
    evidenceUrl: form.sourceUrl,
    evidence: `${form.purpose === "other" ? "A" : `A ${form.purpose}`} form was observed${form.provider ? ` using ${form.provider}` : ""}, with ${form.fields.length} public field${form.fields.length === 1 ? "" : "s"}.`,
  };
}

/** Produce advisory, explainable tool ideas from observed scan signals. This is
 * deliberately deterministic: no LLM output is presented as scan evidence. */
export function recommendTools(signals: ToolSignal[], limit = 2): ToolRecommendation[] {
  const candidates: ToolRecommendation[] = [];
  const forms = parsedForms(signals).filter((form) => !["newsletter", "account"].includes(form.purpose));
  candidates.push(...forms.map(fromForm));

  const booking = find(signals, "booking_embed");
  if (booking?.value_bool && !forms.some((form) => form.purpose === "appointment")) {
    candidates.push({
      name: "book_appointment",
      label: "Let an agent book an available time",
      description: "Connect the scheduling system already embedded on the site so an assistant can find times and prepare a booking.",
      inputs: ["Preferred dates", "Timezone", "Contact details", "Meeting reason"],
      output: "Available slots, then a confirmed booking reference",
      confirmation: "Required before action",
      businessValue: 5,
      effort: 3,
      confidence: "High",
      evidenceSignalKey: "booking_embed",
      evidenceUrl: booking.evidence_url,
      evidence: "An embedded scheduling provider was observed on a scanned page.",
    });
  }

  const library = find(signals, "content_library_links");
  if ((library?.value_num ?? 0) >= 8) {
    candidates.push({
      name: "search_insights",
      label: "Let agents search your expertise",
      description: "Expose the knowledge library as a search tool that returns grounded answers and links to the business's own material.",
      inputs: ["Buyer question", "Optional topic or date filters"],
      output: "Relevant extracts with titles and source URLs",
      confirmation: "Not required — read only",
      businessValue: 4,
      effort: 2,
      confidence: "High",
      evidenceSignalKey: "content_library_links",
      evidenceUrl: library!.evidence_url,
      evidence: `${library!.value_num} discoverable knowledge-library URLs were observed.`,
    });
  }

  const pricing = find(signals, "price_specificity");
  if (pricing?.value_bool) {
    candidates.push({
      name: "get_service_pricing",
      label: "Give agents quotable pricing",
      description: "Return the site's published price bands in a structured response so an assistant can compare options accurately.",
      inputs: ["Service or product", "Optional buyer requirements"],
      output: "Published options, price bands, caveats and source URL",
      confirmation: "Not required — read only",
      businessValue: 4,
      effort: 2,
      confidence: "High",
      evidenceSignalKey: "price_specificity",
      evidenceUrl: pricing.evidence_url,
      evidence: "Specific prices an agent can quote were observed on the pricing page.",
    });
  }

  const formCount = find(signals, "forms_as_latent_tools");
  if (forms.length === 0 && (formCount?.value_num ?? 0) > 0) {
    candidates.push({
      name: "send_enquiry",
      label: "Let an agent send a qualified enquiry",
      description: "Use the existing public form as a structured action, carrying buyer context into the enquiry after confirmation.",
      inputs: ["Contact details", "What the buyer needs", "Optional timing and budget"],
      output: "An enquiry reference and clear next step",
      confirmation: "Required before action",
      businessValue: 4,
      effort: 3,
      confidence: "Medium",
      evidenceSignalKey: "forms_as_latent_tools",
      evidenceUrl: formCount!.evidence_url,
      evidence: `${formCount!.value_num} public form${formCount!.value_num === 1 ? " was" : "s were"} observed; an older scan did not retain individual field names.`,
    });
  }

  const services = find(signals, "services_page_locatable");
  if (services?.value_bool) {
    candidates.push({
      name: "search_services",
      label: "Help agents match buyers to services",
      description: "Turn the published service catalogue into a structured lookup that explains fit, requirements and the next step.",
      inputs: ["Buyer need", "Optional industry or constraints"],
      output: "Matching services with reasons and source URLs",
      confirmation: "Not required — read only",
      businessValue: 3,
      effort: 2,
      confidence: "Medium",
      evidenceSignalKey: "services_page_locatable",
      evidenceUrl: services.evidence_url,
      evidence: "A services or offering page was discoverable from the site's navigation.",
    });
  }

  const llms = find(signals, "llms_txt");
  if (llms?.value_bool) {
    candidates.push({
      name: "get_business_profile",
      label: "Give agents an authoritative business profile",
      description: "Serve the existing agent summary as structured facts so assistants can identify, describe and cite the business consistently.",
      inputs: ["Optional buyer question or topic"],
      output: "Grounded business facts with the canonical source URL",
      confirmation: "Not required — read only",
      businessValue: 2,
      effort: 1,
      confidence: "High",
      evidenceSignalKey: "llms_txt",
      evidenceUrl: llms.evidence_url,
      evidence: "A genuine llms.txt summary was observed at the conventional public address.",
    });
  }

  const ranked = candidates
    .filter((candidate, index, all) => all.findIndex((other) => other.name === candidate.name) === index)
    .sort((a, b) =>
      (b.businessValue * (6 - b.effort)) - (a.businessValue * (6 - a.effort))
      || (b.confidence === "High" ? 1 : 0) - (a.confidence === "High" ? 1 : 0),
    );

  // Older and sparse scans may expose only one positive capability. Fill the
  // public two-card blueprint from observed gaps rather than inventing a tool
  // or repeating a generic recommendation. These remain deterministic and
  // link to the exact negative signal that justified the proposal.
  const gapCandidates: ToolRecommendation[] = [];
  const faq = find(signals, "faq_page_locatable");
  if (faq?.value_bool === false) {
    gapCandidates.push({
      name: "answer_buyer_questions",
      label: "Give agents grounded buyer answers",
      description: "Publish the recurring questions buyers ask, then expose them as a grounded lookup an assistant can query before it recommends the business.",
      inputs: ["Buyer question", "Optional service or situation"],
      output: "A concise answer, relevant caveats and canonical source URL",
      confirmation: "Not required — read only",
      businessValue: 4,
      effort: 2,
      confidence: "Medium",
      evidenceSignalKey: "faq_page_locatable",
      evidenceUrl: faq.evidence_url,
      evidence: "No FAQ or buyer-questions page was discoverable from the site's public navigation.",
      basis: "Observed gap",
    });
  }

  const serviceGap = find(signals, "services_page_locatable");
  if (serviceGap?.value_bool === false) {
    gapCandidates.push({
      name: "match_buyer_to_service",
      label: "Help agents identify the right service",
      description: "Turn the business's service definitions and qualification rules into a lookup that tells an assistant what fits and why.",
      inputs: ["Buyer need", "Optional constraints or urgency"],
      output: "Matching services, fit rationale and the next step",
      confirmation: "Not required — read only",
      businessValue: 4,
      effort: 3,
      confidence: "Medium",
      evidenceSignalKey: "services_page_locatable",
      evidenceUrl: serviceGap.evidence_url,
      evidence: "No services or offering page was discoverable from the site's public navigation.",
      basis: "Observed gap",
    });
  }

  const pricingGap = find(signals, "pricing_page_locatable");
  if (pricingGap?.value_bool === false) {
    gapCandidates.push({
      name: "explain_pricing_and_fit",
      label: "Let agents explain price and fit",
      description: "Publish useful price bands and qualification context, then return them in a structured answer an assistant can compare responsibly.",
      inputs: ["Service or product", "Buyer requirements"],
      output: "Price band, inclusions, caveats and source URL",
      confirmation: "Not required — read only",
      businessValue: 4,
      effort: 3,
      confidence: "Medium",
      evidenceSignalKey: "pricing_page_locatable",
      evidenceUrl: pricingGap.evidence_url,
      evidence: "No pricing page was discoverable from the site's public navigation.",
      basis: "Observed gap",
    });
  }

  for (const candidate of gapCandidates) {
    if (ranked.length >= limit) break;
    if (!ranked.some((other) => other.name === candidate.name)) ranked.push(candidate);
  }

  return ranked.slice(0, limit);
}
