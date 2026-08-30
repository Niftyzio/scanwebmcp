import { describe, expect, it } from "vitest";
import { recommendTools, type ToolSignal } from "./tool-recommendations";

const signal = (partial: Partial<ToolSignal> & Pick<ToolSignal, "signal_key">): ToolSignal => ({
  signal_key: partial.signal_key,
  value_bool: partial.value_bool ?? null,
  value_num: partial.value_num ?? null,
  value_text: partial.value_text ?? null,
  evidence_url: partial.evidence_url ?? "https://example.com/",
});

describe("agent tool recommendations", () => {
  it("returns at most two recommendations, ranked from observed capabilities", () => {
    const tools = recommendTools([
      signal({ signal_key: "booking_embed", value_bool: true }),
      signal({ signal_key: "content_library_links", value_num: 24, evidence_url: "https://example.com/sitemap.xml" }),
      signal({ signal_key: "services_page_locatable", value_bool: true, evidence_url: "https://example.com/services" }),
    ]);

    expect(tools).toHaveLength(2);
    expect(tools.map((tool) => tool.name)).toEqual(["search_insights", "book_appointment"]);
    expect(tools.every((tool) => new URL(tool.evidenceUrl).origin === "https://example.com")).toBe(true);
  });

  it("uses retained form fields for an evidence-backed quote tool", () => {
    const tools = recommendTools([
      signal({
        signal_key: "detected_form_capabilities",
        value_num: 1,
        value_text: JSON.stringify([{
          purpose: "quote",
          sourceUrl: "https://example.com/quote",
          method: "post",
          action: "https://example.com/api/quote",
          provider: null,
          submitLabel: "Get quote",
          fields: [
            { name: "email", type: "email", required: true },
            { name: "project_type", type: "select", required: true },
          ],
        }]),
        evidence_url: "https://example.com/quote",
      }),
    ]);

    expect(tools[0]).toMatchObject({
      name: "request_quote",
      confidence: "High",
      confirmation: "Required before action",
      evidenceSignalKey: "detected_form_capabilities",
    });
    expect(tools[0].inputs).toEqual(["email (required)", "project_type (required)"]);
  });

  it("falls back safely for scans that only stored a form count", () => {
    const tools = recommendTools([
      signal({ signal_key: "forms_as_latent_tools", value_num: 3 }),
      signal({ signal_key: "llms_txt", value_bool: true, evidence_url: "https://example.com/llms.txt" }),
    ]);

    expect(tools[0]).toMatchObject({ name: "send_enquiry", confidence: "Medium" });
    expect(tools[1]).toMatchObject({ name: "get_business_profile", confidence: "High" });
  });

  it("fills a sparse older scan to two recommendations from observed gaps", () => {
    const tools = recommendTools([
      signal({ signal_key: "llms_txt", value_bool: true, evidence_url: "https://example.com/llms.txt" }),
      signal({ signal_key: "faq_page_locatable", value_bool: false, evidence_url: "https://example.com/" }),
      signal({ signal_key: "services_page_locatable", value_bool: false, evidence_url: "https://example.com/" }),
      signal({ signal_key: "pricing_page_locatable", value_bool: false, evidence_url: "https://example.com/" }),
    ]);

    expect(tools).toHaveLength(2);
    expect(tools.map((tool) => tool.name)).toEqual([
      "get_business_profile",
      "answer_buyer_questions",
    ]);
    expect(tools[1]).toMatchObject({
      confidence: "Medium",
      evidenceSignalKey: "faq_page_locatable",
    });
  });
});
