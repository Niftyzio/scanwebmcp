import { describe, expect, it } from "vitest";
import { friendlyToolName } from "./tool-display";

describe("WebMCP tool display names", () => {
  it("turns Render namespaces into readable labels", () => {
    expect(friendlyToolName("render.docs.search")).toBe("Search Render documentation");
    expect(friendlyToolName("render.docs.get-markdown")).toBe("Read a Render documentation page");
    expect(friendlyToolName("render.llms.get-index")).toBe("Browse Render AI index");
    expect(friendlyToolName("render.blog.get-index")).toBe("Browse Render blog");
    expect(friendlyToolName("render.articles.get-index")).toBe("Browse Render articles");
  });

  it("makes common standalone tool identifiers conversational", () => {
    expect(friendlyToolName("request_listing")).toBe("Request a listing");
    expect(friendlyToolName("share_on_linkedin")).toBe("Share on LinkedIn");
    expect(friendlyToolName("record_unsupported_request")).toBe("Record an unsupported request");
  });

  it("keeps an understandable fallback for unknown tools", () => {
    expect(friendlyToolName("acme.orders.cancel-order")).toBe("Cancel Order · Acme orders");
  });
});
