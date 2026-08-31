export type ShopifyWebMCPVerification = "production" | "local_chrome";

export interface ShopifyWebMCPSite {
  domain: string;
  reportPath: string;
  directoryUrl: string;
  verification: ShopifyWebMCPVerification;
  toolCount: number;
  measuredContexts: number;
  d3Score: number | null;
  note: string;
}

/** A dated validation cohort selected from webmcp.com's known-positive
 * directory. It tests scanner coverage; it is not an adoption-rate sample. */
export const SHOPIFY_WEBMCP_COHORT = [
  {
    domain: "aloyoga.com",
    reportPath: "/scan/aloyoga.com",
    directoryUrl: "https://webmcp.com/sites/aloyoga.com",
    verification: "production",
    toolCount: 10,
    measuredContexts: 3,
    d3Score: 60,
    note: "Live standard Shopify surface observed across three storefront contexts.",
  },
  {
    domain: "awaytravel.com",
    reportPath: "/scan/awaytravel.com",
    directoryUrl: "https://webmcp.com/sites/awaytravel.com",
    verification: "production",
    toolCount: 10,
    measuredContexts: 3,
    d3Score: 80,
    note: "Primary field study; stable homepage, collection and product surface.",
  },
  {
    domain: "reebok.com",
    reportPath: "/scan/reebok.com",
    directoryUrl: "https://webmcp.com/sites/reebok.com",
    verification: "production",
    toolCount: 10,
    measuredContexts: 3,
    d3Score: 80,
    note: "Live standard Shopify surface observed across three storefront contexts.",
  },
  {
    domain: "simple-affiliate.com",
    reportPath: "/scan/simple-affiliate.com",
    directoryUrl: "https://webmcp.com/sites/simple-affiliate.com",
    verification: "local_chrome",
    toolCount: 14,
    measuredContexts: 1,
    d3Score: null,
    note: "Local Chrome observed ten standard tools plus four site-specific tools; the production witness was unavailable.",
  },
  {
    domain: "allbirds.com",
    reportPath: "/scan/allbirds.com",
    directoryUrl: "https://webmcp.com/sites/allbirds.com",
    verification: "production",
    toolCount: 10,
    measuredContexts: 3,
    d3Score: 80,
    note: "Live standard Shopify surface observed across three storefront contexts.",
  },
  {
    domain: "ascentprotein.com",
    reportPath: "/scan/ascentprotein.com",
    directoryUrl: "https://webmcp.com/sites/ascentprotein.com",
    verification: "production",
    toolCount: 10,
    measuredContexts: 3,
    d3Score: 80,
    note: "Live standard Shopify surface observed across three storefront contexts.",
  },
] as const satisfies readonly ShopifyWebMCPSite[];

export const SHOPIFY_WEBMCP_OBSERVED_AT = "31 August 2026";

export const SHOPIFY_STANDARD_TOOL_GROUPS = {
  answer: [
    "browse_store",
    "get_cart",
    "get_product",
    "search_catalog",
    "search_shop_policies_and_faqs",
  ],
  action: ["manage_orders", "show_variant", "update_cart"],
  sensitiveAction: ["cancel_cart", "proceed_to_checkout"],
} as const;

export const SIMPLE_AFFILIATE_CUSTOM_TOOLS = [
  "get_pricing",
  "get_product_brief",
  "search_faq",
  "open_app_store_listing",
] as const;

export function getShopifyWebMCPCohortStats() {
  const productionVerified = SHOPIFY_WEBMCP_COHORT.filter(
    (site) => site.verification === "production",
  ).length;
  return {
    total: SHOPIFY_WEBMCP_COHORT.length,
    productionVerified,
    locallyVerified: SHOPIFY_WEBMCP_COHORT.length - productionVerified,
  };
}
