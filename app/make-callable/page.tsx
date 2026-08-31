import type { Metadata } from "next";
import WebMCPTools from "@/components/WebMCPTools";

export const metadata: Metadata = {
  title: "Make your site agent-callable",
  description:
    "The current, correct way to register a WebMCP tool on your website — with a copy-paste starting point and plain-language install steps.",
};

const SNIPPET = `<script>
// ScanWebMCP.com — starter WebMCP tool (API current as of late Aug 2026).
// Wraps your existing enquiry form as a tool an AI assistant can call,
// with the visitor confirming before anything is sent.
(function () {
  // Publish a detectable manifest FIRST — ordinary browsers don't implement
  // modelContext, so this is how scanners (including ScanWebMCP.com) can
  // verify your site declares tools:
  window.__webmcpToolManifest = ["send_enquiry"];
  document.documentElement.dataset.webmcpTools = "send_enquiry";

  if (!("modelContext" in document)) return; // harmless everywhere else

  document.modelContext.registerTool({
    name: "send_enquiry",
    description:
      "Send an enquiry to this business. Use when the visitor wants to " +
      "get in touch, ask about services, or request a callback.",
    inputSchema: {
      type: "object",
      properties: {
        name:    { type: "string", description: "Visitor's name" },
        email:   { type: "string", description: "Visitor's email address" },
        message: { type: "string", description: "What they need, in their words" }
      },
      required: ["name", "email", "message"]
    },
    async execute({ name, email, message }) {
      // 1. Fill YOUR existing form's fields (adjust the selectors):
      const form = document.querySelector("form");
      if (!form) return { content: [{ type: "text", text: "No form found on this page." }] };
      form.querySelector('[name=name]')?.setAttribute("value", name);
      form.querySelector('[name=email]')?.setAttribute("value", email);
      const msg = form.querySelector("textarea");
      if (msg) msg.value = message;

      // 2. Ask the HUMAN to confirm — write tools must never fire silently:
      const okay = confirm("Your assistant wants to send this enquiry:\\n\\n" + message + "\\n\\nSend it?");
      if (!okay) return { content: [{ type: "text", text: "The visitor declined to send the enquiry." }] };

      form.requestSubmit();
      return { content: [{ type: "text", text: "Enquiry submitted. The business will reply to " + email + "." }] };
    }
  });
})();
</script>`;

export default function MakeCallable() {
  return (
    <main className="wrap article editorial-page editorial-guide">
      <WebMCPTools mode="site" />
      <p className="kicker">Implementation guide · kept current with the WebMCP spec · updated 29 Aug 2026</p>
      <h1>Make your site agent-callable</h1>
      <p className="lede">
        &ldquo;Callable&rdquo; means an AI assistant can <em>do</em> something on your site — not
        just read it. Getting there is one script tag. This page is the current, correct way, kept
        up to date as the standard changes (it renamed itself in May; it will change again).
      </p>

      <h2>Before you start: is this the right rung?</h2>
      <p>
        Climb in order. If your scan says agents can&apos;t read you (rung 0) or can&apos;t answer
        buyers&apos; questions about you (rung 1), fix those first — a text file and some published
        answers, no code at all. Tools amplify a legible site; they can&apos;t rescue an illegible
        one.
      </p>

      <h2>What WebMCP is, in one paragraph</h2>
      <p>
        A browser standard that lets your page hand AI assistants typed tools instead of buttons to
        guess at. As of 25 August 2026, ChatGPT&apos;s desktop-app browser executes these tools;
        Chrome is trialling the same standard. The code runs only in your visitor&apos;s tab, only
        when an agent-capable browser is present, and does nothing at all anywhere else.
      </p>

      <h2>The starter tool: your enquiry form, callable</h2>
      <p>
        Copy this, adjust the three selectors to match your form, and paste it into your
        site&apos;s custom-code box (Wix: Settings → Custom Code · Squarespace: Code Injection ·
        Shopify: theme.liquid · WordPress: a header-scripts plugin — always the &ldquo;before
        &lt;/body&gt;&rdquo; slot).
      </p>
      <pre className="snippet code-block">{SNIPPET}</pre>
      <p className="small muted">
        Note the confirm() step: a tool that acts on someone&apos;s behalf asks the human before it
        commits. That is the difference between Transactable and creepy.
      </p>

      <h2>Test it in two minutes</h2>
      <ol>
        <li>Open your site in the <strong>ChatGPT desktop app&apos;s browser</strong> (latest version).</li>
        <li>Ask: <em>&ldquo;What tools does this page offer? Send an enquiry for me — my name is…&rdquo;</em></li>
        <li>Then <a href="/">re-scan your site here</a> — the scanner detects registered tools, and your result page updates to show them.</li>
      </ol>

      <h2>The current API contract (for you or your AI)</h2>
      <p>
        If you&apos;re asking an AI assistant to draft tools for you, give it these facts —
        training data is usually behind this spec:
      </p>
      <ul className="small">
        <li>The entry point is <code>document.modelContext</code> — the older <code>navigator.modelContext</code> is deprecated; feature-detect with <code>&quot;modelContext&quot; in document</code>.</li>
        <li><code>registerTool(&#123; name, description, inputSchema, execute &#125;)</code> — <code>inputSchema</code> is JSON Schema; <code>execute(args)</code> receives an object (not a JSON string) and returns <code>&#123; content: [&#123; type: &quot;text&quot;, text: &quot;…&quot; &#125;] &#125;</code>.</li>
        <li>Tools are gated by a <code>tools</code> permissions policy defaulting to same-origin; cross-origin iframes need <code>allow=&quot;tools&quot;</code>.</li>
        <li>The tool <em>description</em> is what the model reads to decide when to call it — write it as instructions, and treat it as a security surface: a misleading description misleads the agent.</li>
        <li>ChatGPT&apos;s implementation covers a subset of the spec (no declarative form attributes, no iframe tools) — keep to <code>registerTool</code>.</li>
      </ul>

      <p className="muted">
        Want the full picture — which of your capabilities are worth exposing, in what order, at
        what value? That&apos;s the <a href="/map">Agent Opportunity Map</a>. This page gets you
        your first tool; the map gets you the right ten.
      </p>
    </main>
  );
}
