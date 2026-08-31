import { siteUrl } from "./site";

const PROTOCOL_VERSION = "2025-06-18";

const GUIDES = {
  overview: {
    title: "ScanWebMCP.com overview",
    url: siteUrl("/index.md"),
    text: "ScanWebMCP.com is a free public scanner for what AI agents can read, answer, and call on a website. It publishes REST, MCP, WebMCP, ARD, OpenAPI, llms.txt, and an Agent Skill.",
  },
  methodology: {
    title: "Agent Surface Ladder",
    url: siteUrl("/ladder"),
    text: "The versioned Ladder moves from Invisible to Readable, Answerable, Callable, and Transactable. Results preserve unknown or unmeasured evidence rather than turning it into a zero.",
  },
  developers: {
    title: "Developer API",
    url: siteUrl("/developers"),
    text: "The public REST API requires no key. POST /api/scan starts or reuses a scan; GET /api/scan/{slug} returns the public result; GET /api/observatory returns aggregate data. The canonical contract is /openapi.json.",
  },
  privacy: {
    title: "Privacy",
    url: siteUrl("/privacy"),
    text: "The scanner requests public pages only, stores bounded evidence, uses salted non-reversible network hashes for abuse controls, and keeps benchmark-update consent separate from transactional report delivery.",
  },
  "scanner-behavior": {
    title: "Scanner behavior",
    url: siteUrl("/about-scanner"),
    text: "The scanner identifies itself, honours robots.txt, caps each scan, refuses private and reserved networks, and never authenticates to the target website.",
  },
} as const;

type GuideSlug = keyof typeof GUIDES;

const TOOLS = [
  {
    name: "search_scanwebmcp_docs",
    description: "Search ScanWebMCP.com documentation for API, methodology, privacy, crawler, MCP, or report-delivery guidance.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", description: "Documentation question or keywords." } },
      required: ["query"],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: "get_scanwebmcp_guide",
    description: "Read one canonical ScanWebMCP.com guide with its source URL.",
    inputSchema: {
      type: "object",
      properties: {
        guide: {
          type: "string",
          enum: Object.keys(GUIDES),
          description: "Guide to retrieve.",
        },
      },
      required: ["guide"],
    },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
];

const result = (text: string, structuredContent?: object) => ({
  content: [{ type: "text", text }],
  ...(structuredContent ? { structuredContent } : {}),
});

function callTool(name: string, args: Record<string, unknown>) {
  if (name === "get_scanwebmcp_guide") {
    const guide = String(args.guide ?? "") as GuideSlug;
    const match = GUIDES[guide];
    if (!match) {
      const message = `Unknown guide: ${guide}`;
      return { ...result(message, { error: { code: "UNKNOWN_GUIDE", message } }), isError: true };
    }
    return result(`${match.title}\n\n${match.text}\n\nSource: ${match.url}`, { guide, ...match });
  }

  if (name === "search_scanwebmcp_docs") {
    const query = String(args.query ?? "").trim().toLowerCase();
    if (!query) {
      const message = "query is required";
      return { ...result(message, { error: { code: "MISSING_QUERY", message } }), isError: true };
    }
    const terms = query.split(/\s+/).filter((term) => term.length > 2);
    const matches = Object.entries(GUIDES)
      .map(([slug, guide]) => ({
        slug,
        guide,
        score: terms.filter((term) => `${guide.title} ${guide.text}`.toLowerCase().includes(term)).length,
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    const selected = matches.length
      ? matches
      : [{ slug: "overview", guide: GUIDES.overview, score: 0 }];
    return result(
      selected.map(({ guide }) => `${guide.title}: ${guide.text} Source: ${guide.url}`).join("\n\n"),
      { results: selected.map(({ slug, guide }) => ({ slug, ...guide })) },
    );
  }

  const message = `Unknown tool: ${name}`;
  return { ...result(message, { error: { code: "UNKNOWN_TOOL", message } }), isError: true };
}

type RpcRequest = { jsonrpc: "2.0"; id?: number | string | null; method: string; params?: Record<string, unknown> };

export function handleDocsMcpRequest(body: unknown): Response {
  const requests: RpcRequest[] = Array.isArray(body) ? body as RpcRequest[] : [body as RpcRequest];
  const responses: object[] = [];

  for (const request of requests) {
    if (!request || request.jsonrpc !== "2.0" || typeof request.method !== "string") {
      responses.push({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid request" } });
      continue;
    }
    if (request.method.startsWith("notifications/")) continue;
    const id = request.id ?? null;
    if (request.method === "initialize") {
      responses.push({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: typeof request.params?.protocolVersion === "string" ? request.params.protocolVersion : PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: "scanwebmcp-docs", version: "1.0.0" },
          instructions: "Use these read-only tools for ScanWebMCP.com product, API, methodology, privacy, and scanner documentation.",
        },
      });
    } else if (request.method === "ping") {
      responses.push({ jsonrpc: "2.0", id, result: {} });
    } else if (request.method === "tools/list") {
      responses.push({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
    } else if (request.method === "tools/call") {
      const name = String(request.params?.name ?? "");
      const args = (request.params?.arguments ?? {}) as Record<string, unknown>;
      responses.push({ jsonrpc: "2.0", id, result: callTool(name, args) });
    } else {
      responses.push({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${request.method}` } });
    }
  }

  if (responses.length === 0) return new Response(null, { status: 202 });
  return Response.json(Array.isArray(body) ? responses : responses[0]);
}
