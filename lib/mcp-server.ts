/**
 * Minimal MCP server (Streamable HTTP, JSON responses) — the dual export from
 * the spec: same capabilities as the WebMCP layer, callable by Claude and
 * ChatGPT apps today. Tools-only; no sessions, no SSE stream needed.
 */
import { requestScan, getScanPage, logAgentHit, slugify } from "./scan-service";
import { getObservatoryStats } from "./benchmark";
import { captureReportLead, LeadError } from "./leads";
import { validateTarget } from "./engine";
import { siteUrl } from "./site";

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
      "Run an Agent Surface Scan of a website: its public rung and dimension scores on the Agent Surface Ladder. The full evidenced findings are available by email after the human opts in. Takes 10–40 seconds.",
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
    name: "email_report",
    description:
      "Send the full evidenced Agent Surface Scan report for an already-scanned website to an email address. " +
      "CONSEQUENTIAL — sends one transactional report. Optional benchmark updates require a separate boolean opt-in and email confirmation. " +
      "Only call it with an email address the human explicitly gave and confirmed for this purpose in the current conversation. Never guess, look up, or auto-fill an address.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "The scanned website, e.g. example.com" },
        email: { type: "string", description: "The email address the human explicitly provided and confirmed." },
        benchmark_updates: { type: "boolean", description: "True only if the human separately opted into occasional benchmark updates. Defaults to false." },
      },
      required: ["url", "email"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  {
    name: "get_observatory_stats",
    description:
      "Live aggregate findings from the scan corpus: what share of scanned businesses block AI crawlers, publish llms.txt, expose anything callable, and the rung distribution overall and by sector.",
    inputSchema: { type: "object", properties: {} },
  },
];

const text = (t: string) => ({ content: [{ type: "text", text: t }] });

async function callTool(
  name: string,
  args: Record<string, unknown>,
  context: { ua: string | null; ipHash: string },
) {
  const { ua, ipHash } = context;
  try {
    if (name === "scan_agent_surface") {
      const url = String(args.url ?? "");
      const r = await requestScan({ url, trigger: "agent", requesterType: "agent", userAgent: ua ?? "mcp-client", ipHash });
      const page = await getScanPage(r.slug);
      if (!page || page.scan.status !== "complete") return text(`Scan of ${url} did not complete.`);
      const { scan } = page;
      await logAgentHit({ toolName: name, argumentsJson: args, agentUa: ua ?? undefined, outcome: "ok", scanId: scan.id, ipHash });
      return text(
        `${scan.sites.domain}: rung ${scan.rung} (${LADDER[scan.rung ?? 0][0]}) on the Agent Surface Ladder. ` +
          `Scores /100 — legibility ${scan.d1}, answerability ${scan.d2}, callability ${scan.d3}, transactability ${scan.d4}, standing ${scan.d5}. ` +
          `Public result: ${siteUrl(`/scan/${r.slug}`)}. ` +
          `The full findings, timestamped evidence, and ranked recommendations are email-gated. ` +
          `NEXT STEP FOR THE ASSISTANT: ask the human whether they would like the full report emailed to them. If they say yes, ask which email address to use, then call email_report. Do not guess an address or call email_report without an address explicitly provided for this report.`,
      );
    }
    if (name === "get_ladder_definition") {
      await logAgentHit({ toolName: name, argumentsJson: args, agentUa: ua ?? undefined, outcome: "ok", ipHash });
      const rung = typeof args.rung === "number" ? args.rung : undefined;
      if (rung != null && LADDER[rung]) return text(`Rung ${rung} — ${LADDER[rung][0]}: ${LADDER[rung][1]}`);
      return text(
        "Agent Surface Ladder v1.0, by Sara Simeone. Five dimensions: legibility, answerability, callability, transactability, standing. Rungs: " +
          LADDER.map((l, i) => `${i} ${l[0]} — ${l[1]}`).join(" | ") +
          ` Full method: ${siteUrl("/ladder")}`,
      );
    }
    if (name === "email_report") {
      const { domain } = validateTarget(String(args.url ?? ""));
      const slug = slugify(domain);
      try {
        const r = await captureReportLead({
          email: String(args.email ?? ""),
          slug,
          ipHash,
          marketingConsent: args.benchmark_updates === true,
        });
        await logAgentHit({ toolName: name, argumentsJson: { url: args.url, benchmark_updates: args.benchmark_updates === true }, agentUa: ua ?? undefined, outcome: "ok", ipHash });
        return text(
          `Report for ${r.domain} ${r.delivery === "sent" ? "sent" : "queued for delivery"} to ${String(args.email).trim().toLowerCase()}. It links the live evidenced result at ${siteUrl(`/scan/${slug}`)}.` +
            (args.benchmark_updates === true ? " A separate confirmation link is included; updates remain off until confirmed." : " No marketing updates were requested."),
        );
      } catch (e) {
        if (e instanceof LeadError) {
          await logAgentHit({ toolName: name, argumentsJson: { url: args.url }, agentUa: ua ?? undefined, outcome: "refused", ipHash }).catch(() => {});
          return { ...text(`Report not sent: ${e.message}${e.status === 404 ? " Run scan_agent_surface first." : ""}`), isError: true };
        }
        throw e;
      }
    }
    if (name === "get_observatory_stats") {
      const s = await getObservatoryStats();
      await logAgentHit({ toolName: name, argumentsJson: args, agentUa: ua ?? undefined, outcome: "ok", ipHash });
      return text(
        `Corpus: ${s.sites} sites, ${s.scans} scans, ${s.signalsStored} signals. ` +
          `${s.pctBlockingAnyAiBot}% block an AI crawler in robots.txt; ${s.pctWafBlocked}% wall agents out at the firewall; ` +
          `${s.pctLlmsTxt}% publish llms.txt; ${s.pctSellsMarkup}% have machine-readable offering markup; ` +
          `${s.pctAnyCallable}% expose anything callable; ${s.totalLatentForms} latent forms found. ` +
          `Rung distribution: ${JSON.stringify(s.rungDist)}. By sector: ${s.bySector.map((r) => `${r.sector} n=${r.n}`).join(", ")}. ` +
          `Live view: ${siteUrl("/observatory")}`,
      );
    }
    return { ...text(`Unknown tool: ${name}`), isError: true };
  } catch (e) {
    await logAgentHit({ toolName: name, argumentsJson: name === "email_report" ? { url: args.url } : args, agentUa: ua ?? undefined, outcome: "error", ipHash }).catch(() => {});
    return { ...text(`Tool error: ${e instanceof Error ? e.message : String(e)}`), isError: true };
  }
}

type RpcRequest = { jsonrpc: "2.0"; id?: number | string | null; method: string; params?: Record<string, unknown> };

export async function handleMcpRequest(
  body: unknown,
  context: { ua: string | null; ipHash: string },
): Promise<Response> {
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
      const result = await callTool(name, args, context);
      responses.push({ jsonrpc: "2.0", id, result });
    } else {
      responses.push({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${req.method}` } });
    }
  }

  if (responses.length === 0) return new Response(null, { status: 202 });
  return Response.json(Array.isArray(body) ? responses : responses[0]);
}
