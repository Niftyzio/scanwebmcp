import { describe, expect, it } from "vitest";
import robots from "./robots";

describe("robots.txt AI crawler policy", () => {
  it("preserves the selected crawler allow and block rules", () => {
    expect(robots().rules).toEqual([
      { userAgent: "OAI-SearchBot", allow: "/" },
      { userAgent: "Claude-SearchBot", allow: "/" },
      { userAgent: ["PerplexityBot", "Perplexity-User"], allow: "/" },
      { userAgent: "GPTBot", disallow: "/" },
      { userAgent: "ClaudeBot", disallow: "/" },
      { userAgent: "CCBot", disallow: "/" },
      { userAgent: "ByteSpider", disallow: "/" },
      {
        userAgent: "*",
        allow: "/",
        other: { "Content-Signal": "search=yes, ai-train=no" },
      },
    ]);
  });
});
