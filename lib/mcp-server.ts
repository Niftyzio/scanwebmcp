/**
 * Minimal MCP server (Streamable HTTP, JSON responses) — the dual export from
 * the spec: same capabilities as the WebMCP layer, callable by Claude and
 * ChatGPT apps today. Tools-only; no sessions, no SSE stream needed.
 */
import { requestScan, getScanPage, logAgentHit } from "./scan-service";
import { getObservatoryStats } from "./benchmark";

const PROTOCOL_VERSION = "2025-06-18";

const LADDER = [
  ["Invisible", "Agents blocked or core content unreadable without JavaScript."],
  ["Readable", "An agent can retrieve and understand what the business does."],
  ["Answerable", "An agent can answer a buyer's real questions without a human."],
  ["Callable", "At least one capability is invocable: MCP endpoint, documented API, or registered WebMCP tool."],
  ["Transactable", "An agent can complete a meaningful action end to end, with human confirmation."],
];

const TOOLS = [
  {
    name: "scan_agent_surface",
    description:
      "Run an Agent Surface Scan of a website: its rung on the Agent Surface Ladder (Invisible → Readable → Answerable → Callable → Transactable), dimension scores, evidenced opportunities, and a public result URL. Takes 10–40 seconds.",
    inputSchema: {
      type: "object",
      properties: { url: { type: "string", description: "Website to scan, e.g. example.com" } },
      required: ["url"],
    },
  },
  {
    name: "get_ladder_definition",
    description: "The published Agent Surface Ladder v1.0 rubric — rungs, definitions, and scoring weights.",
    inputSchema: { type: "object", properties: { rung: { type: "number", description: "Optional rung 0-4" } } },
  },
  {
    name: "get_observatory_stats",
    description:
      "Live aggregate findings from the scan corpus: what share of scanned businesses block AI crawlers, publish llms.txt, expose anything callable, and the rung distribution overall and by sector.",
    inputSchema: { type: "object", properties: {} },
  },
];

const text = (t: string) => ({ content: [{ type: "text", text: t }] });

async function callTool(name: string, args: Record<string, unknown>, ua: string | null) {
  try {
    if (name === "scan_agent_surface") {
      const url = String(args.url ?? "");
      const r = await requestScan({ url, trigger: "agent", requesterType: "agent", userAgent: ua ?? "mcp-client" });
      const page = await getScanPage(r.slug);
      if (!page || page.scan.status !== "complete") return text(`Scan of ${url} did not complete.`);
      const { scan, opportunities } = page;
      await logAgentHit({ toolName: name, argumentsJson: args, agentUa: ua ?? undefined, outcome: "ok", scanId: scan.id });
      return text(
        `${scan.sites.domain}: rung ${scan.rung} (${LADDER[scan.rung ?? 0][0]}) on the Agent Surface Ladder. ` +
          `Scores /100 — legibility ${scan.d1}, answerability ${scan.d2}, callability ${scan.d3}, transactability ${scan.d4}, standing ${scan.d5}. ` +
          `Opportunities: ${opportunities.map((o) => o.rendered_text.replace(/\*\*/g, "")).join(" · ")} ` +
          `Full evidenced result: https://scanwebmcp.vercel.app/scan/${r.slug}`,
      );
    }
    if (name === "get_ladder_definition") {
      await logAgentHit({ toolName: name, argumentsJson: args, agentUa: ua ?? undefined, outcome: "ok" });
      const rung = typeof args.rung === "number" ? args.rung : undefined;
      if (rung != null && LADDER[rung]) return text(`Rung ${rung} — ${LADDER[rung][0]}: ${LADDER[rung][1]}`);
      return text(
        "Agent Surface Ladder v1.0 (weights: legibility 25%, answerability 30%, callability 20%, transactability 15%, standing 10%): " +
          LADDER.map((l, i) => `${i} ${l[0]} — ${l[1]}`).join(" | ") +
          " Full method: https://scanwebmcp.vercel.app/ladder",
      );
    }
    if (name === "get_observatory_stats") {
      const s = await getObservatoryStats();
      await logAgentHit({ toolName: name, argumentsJson: args, agentUa: ua ?? undefined, outcome: "ok" });
      return text(
        `Corpus: ${s.sites} sites, ${s.scans} scans, ${s.signalsStored} signals. ` +
          `${s.pctBlockingAnyAiBot}% block an AI crawler in robots.txt; ${s.pctWafBlocked}% wall agents out at the firewall; ` +
          `${s.pctLlmsTxt}% publish llms.txt; ${s.pctSellsMarkup}% have machine-readable offering markup; ` +
          `${s.pctAnyCallable}% expose anything callable; ${s.totalLatentForms} latent forms found. ` +
          `Rung distribution: ${JSON.stringify(s.rungDist)}. By sector: ${s.bySector.map((r) => `${r.sector} n=${r.n}`).join(", ")}. ` +
          `Live view: https://scanwebmcp.vercel.app/observatory`,
      );
    }
    return { ...text(`Unknown tool: ${name}`), isError: true };
  } catch (e) {
    await logAgentHit({ toolName: name, argumentsJson: args, agentUa: ua ?? undefined, outcome: "error" }).catch(() => {});
    return { ...text(`Tool error: ${e instanceof Error ? e.message : String(e)}`), isError: true };
  }
}

type RpcRequest = { jsonrpc: "2.0"; id?: number | string | null; method: string; params?: Record<string, unknown> };

export async function handleMcpRequest(body: unknown, ua: string | null): Promise<Response> {
  const requests: RpcRequest[] = Array.isArray(body) ? (body as RpcRequest[]) : [body as RpcRequest];
  const responses: object[] = [];

  for (const req of requests) {
    if (!req || req.jsonrpc !== "2.0" || typeof req.method !== "string") {
      responses.push({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid request" } });
      continue;
    }
    if (req.method.startsWith("notifications/")) continue; // no response to notifications
    const id = req.id ?? null;
    if (req.method === "initialize") {
      responses.push({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion:
            typeof req.params?.protocolVersion === "string" ? req.params.protocolVersion : PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: "agent-surface-scan", version: "0.1.0" },
          instructions:
            "The Agent Surface Scan measures how visible, answerable and callable a business website is to AI agents, scored against the published Agent Surface Ladder v1.0. Use scan_agent_surface with any URL.",
        },
      });
    } else if (req.method === "ping") {
      responses.push({ jsonrpc: "2.0", id, result: {} });
    } else if (req.method === "tools/list") {
      responses.push({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
    } else if (req.method === "tools/call") {
      const name = String(req.params?.name ?? "");
      const args = (req.params?.arguments ?? {}) as Record<string, unknown>;
      const result = await callTool(name, args, ua);
      responses.push({ jsonrpc: "2.0", id, result });
    } else {
      responses.push({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${req.method}` } });
    }
  }

  if (responses.length === 0) return new Response(null, { status: 202 });
  return Response.json(Array.isArray(body) ? responses : responses[0]);
}
