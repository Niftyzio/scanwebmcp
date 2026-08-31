import type { Metadata } from "next";
import WebMCPTools from "@/components/WebMCPTools";
import {
  getShopifyWebMCPCohortStats,
  SHOPIFY_STANDARD_TOOL_GROUPS,
  SHOPIFY_WEBMCP_COHORT,
  SHOPIFY_WEBMCP_OBSERVED_AT,
  SIMPLE_AFFILIATE_CUSTOM_TOOLS,
} from "@/lib/shopify-webmcp-cohort";

export const metadata: Metadata = {
  title: "Shopify WebMCP field study: ten tools hiding in plain sight",
  description:
    "A live, page-aware study of WebMCP tools on six selected Shopify storefronts, led by Away Travel and backed by public scan evidence.",
};

const away = SHOPIFY_WEBMCP_COHORT.find((site) => site.domain === "awaytravel.com")!;
const cohortStats = getShopifyWebMCPCohortStats();

function ToolGroup({
  label,
  tools,
}: {
  label: string;
  tools: readonly string[];
}) {
  return (
    <div className="shopify-tool-group">
      <span>{label}</span>
      <div>{tools.map((tool) => <code key={tool}>{tool}</code>)}</div>
    </div>
  );
}

export default function ShopifyWebMCPCaseStudy() {
  return (
    <main className="wrap article editorial-page editorial-shopify-study">
      <WebMCPTools mode="site" />
      <p className="kicker">Field study · {SHOPIFY_WEBMCP_OBSERVED_AT} · live registry evidence</p>
      <h1>Ten agent tools hiding in a storefront</h1>
      <p className="lede">
        Away Travel looks like a familiar ecommerce site. To a WebMCP-aware browser it also exposes
        a structured route from product discovery to checkout. We scanned that live tool surface —
        then checked five more Shopify storefronts to see whether the pattern held.
      </p>

      <section className="shopify-study-metrics" aria-label="Field study headline results">
        <div><strong>{away.toolCount}</strong><span>live tools on Away Travel</span></div>
        <div><strong>{away.measuredContexts}</strong><span>page contexts checked</span></div>
        <div><strong>{cohortStats.productionVerified}/{cohortStats.total}</strong><span>verified by the production scanner</span></div>
      </section>

      <aside className="study-scope-note">
        <strong>Read this as a scanner validation study, not an adoption rate.</strong> We deliberately
        selected six storefronts already listed as WebMCP-positive by webmcp.com. The question was
        whether our independent scanner could observe and explain their live tools.
      </aside>

      <h2>Away Travel: one surface, three page contexts</h2>
      <p>
        The production scan observed the same ten tools on the homepage, a collection page and a
        product page. That consistency matters: an agent can plan a shopping journey without losing
        capabilities as the visible page changes. See the <a href={away.reportPath}>public Away Travel report</a>
        {" "}and the <a href={away.directoryUrl}>independent directory entry</a>.
      </p>

      <div className="shopify-tool-groups">
        <ToolGroup label="5 answer tools" tools={SHOPIFY_STANDARD_TOOL_GROUPS.answer} />
        <ToolGroup label="3 action tools" tools={SHOPIFY_STANDARD_TOOL_GROUPS.action} />
        <ToolGroup label="2 sensitive actions" tools={SHOPIFY_STANDARD_TOOL_GROUPS.sensitiveAction} />
      </div>

      <h2>A journey an agent can understand</h2>
      <ol className="agent-journey" aria-label="Illustrative WebMCP shopping journey">
        <li><span>01</span><div><code>search_catalog</code><p>Find products from a natural-language request.</p></div></li>
        <li><span>02</span><div><code>get_product</code><p>Read structured product and variant details.</p></div></li>
        <li><span>03</span><div><code>show_variant</code><p>Bring the matching option into the human&apos;s view.</p></div></li>
        <li><span>04</span><div><code>update_cart</code><p>Change cart state with an explicit action.</p></div></li>
        <li><span>05</span><div><code>proceed_to_checkout</code><p>Hand off at the sensitive boundary.</p></div></li>
      </ol>
      <p className="study-method-note">
        We discovered and classified these contracts; we did not invoke them or place an order.
        Transactional completion requires a separate, consented test.
      </p>

      <h2>The six-store validation cohort</h2>
      <div className="shopify-cohort-table">
        <table>
          <caption>Selected known-positive Shopify storefronts observed on {SHOPIFY_WEBMCP_OBSERVED_AT}</caption>
          <thead>
            <tr><th>Storefront</th><th>Verification</th><th>Tools</th><th>Contexts</th><th>Evidence</th></tr>
          </thead>
          <tbody>
            {SHOPIFY_WEBMCP_COHORT.map((site) => (
              <tr key={site.domain}>
                <td><strong>{site.domain}</strong></td>
                <td>{site.verification === "production" ? "Production" : "Local Chrome"}</td>
                <td>{site.toolCount}</td>
                <td>{site.measuredContexts}</td>
                <td>
                  <a href={site.reportPath}>Scan</a>{" · "}
                  <a href={site.directoryUrl}>Directory</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        Five storefronts produced live registry evidence in the production scanner. The sixth,
        Simple Affiliate, was unmeasured in that production run; a local Chrome run independently
        observed 14 tools. We show the distinction instead of converting an unavailable witness into
        a false negative.
      </p>

      <h2>The interesting exception: tools unique to the business</h2>
      <p>
        Simple Affiliate exposed Shopify&apos;s ten standard commerce tools plus four capabilities specific
        to its product. That is the deeper opportunity: a platform can supply the common surface while
        each business adds the actions that make it distinct.
      </p>
      <div className="custom-tool-strip">
        {SIMPLE_AFFILIATE_CUSTOM_TOOLS.map((tool) => <code key={tool}>{tool}</code>)}
      </div>

      <h2>What the scanner learned</h2>
      <p>
        Detecting that WebMCP exists is only the first layer. The scanner now preserves tool names,
        input schemas, WebMCP annotations, classifications and the page context that exposed each tool.
        It also normalises the object and serialized schema shapes found across Chrome transports, and
        keeps an unavailable browser witness separate from a verified zero.
      </p>
      <p>
        That turns a browser feature into an auditable question for a business: <em>what can an agent
        actually do here, on which page, with what contract, and where should a human remain in control?</em>
      </p>

      <section className="cta">
        <h2>Inspect your own agent surface</h2>
        <p>Run the same page-aware scan against any public site.</p>
        <p><a className="button" href="/">Scan a site</a></p>
      </section>
    </main>
  );
}
