import { describe, expect, it } from "vitest";
import {
  getShopifyWebMCPCohortStats,
  SHOPIFY_STANDARD_TOOL_GROUPS,
  SHOPIFY_WEBMCP_COHORT,
  SIMPLE_AFFILIATE_CUSTOM_TOOLS,
} from "./shopify-webmcp-cohort";

describe("Shopify WebMCP validation cohort", () => {
  it("keeps the selected six-site cohort and its verification split explicit", () => {
    expect(getShopifyWebMCPCohortStats()).toEqual({
      total: 6,
      productionVerified: 5,
      locallyVerified: 1,
    });
    expect(SHOPIFY_WEBMCP_COHORT.filter((site) => site.verification === "local_chrome"))
      .toEqual([expect.objectContaining({ domain: "simple-affiliate.com", toolCount: 14 })]);
  });

  it("uses Away Travel as the primary three-context field study", () => {
    expect(SHOPIFY_WEBMCP_COHORT.find((site) => site.domain === "awaytravel.com"))
      .toEqual(expect.objectContaining({ verification: "production", toolCount: 10, measuredContexts: 3 }));
  });

  it("documents the observed five/three/two standard tool split", () => {
    expect(SHOPIFY_STANDARD_TOOL_GROUPS.answer).toHaveLength(5);
    expect(SHOPIFY_STANDARD_TOOL_GROUPS.action).toHaveLength(3);
    expect(SHOPIFY_STANDARD_TOOL_GROUPS.sensitiveAction).toHaveLength(2);
    expect(SIMPLE_AFFILIATE_CUSTOM_TOOLS).toHaveLength(4);
  });
});
