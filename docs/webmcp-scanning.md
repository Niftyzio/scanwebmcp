# WebMCP scan contract

The scanner measures live registrations without invoking a tool or changing a
site. It is an evidence collector, not an autonomous user.

## Coverage

- Every eligible site is checked at its homepage plus at most two linked,
  high-signal contexts.
- A site with e-commerce evidence is checked at up to four linked contexts:
  homepage, catalogue/collection, representative product, and cart.
- Contexts are visited sequentially inside one browser session. Login,
  account, checkout, payment, admin, and off-origin pages are excluded.
- `robots.txt` applies to every selected context.
- The session has a hard time budget; a domain with an active scan reuses that
  run instead of starting another one.

## Evidence

The runtime inventory keeps the exact distinct count and a bounded evidence
sample of tool name, description, input schema, annotations, final page URL,
and deterministic category (`answer`, `action`, or `sensitive_action`). The
public report shows counts; names and descriptors remain behind the existing
email gate.

On an unlocked report, `get_webmcp_inventory()` exposes the same structured
evidence to an agent and opens the corresponding evidence card for the human.
Its bounded response includes each captured tool's deterministic category,
first observed page, input names, whether the surface changes by page, and
obvious description, schema, or standard-annotation gaps. Locked reports return
the existing consent-safe email gate rather than inventory details.

Registrations are unioned across pages. A tool is counted once site-wide while
retaining the first page on which it was witnessed. The report also records
whether the tool set changes by page.

## Runtime safety and uncertainty

Same-origin resources and audited Shopify runtime assets are allowed directly.
A cross-origin script whose URL looks WebMCP-related is fetched through the
SSRF-hardened HTTP client, bounded to three scripts and 500 KB each, and is
fulfilled into the browser only when its body contains a WebMCP signature.
Query strings are removed from stored evidence.

If a WebMCP-looking runtime cannot be safely loaded, the report records a
blocked runtime dependency. An empty registry in that situation is unmeasured,
not “zero tools.” A positive partial inventory remains positive but is marked
as potentially incomplete.

## Provider boundary

Browser connection details stay inside `lib/render.ts`; scan selection,
inventory, scoring, and reporting do not depend on Browserless. This preserves
a clean boundary for evaluating another Chromium provider later.
