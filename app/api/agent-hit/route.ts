import { NextResponse } from "next/server";
import { logAgentHit } from "@/lib/scan-service";
import { requesterHash } from "@/lib/request-identity";

const ALLOWED_TOOLS = new Set([
  "scan_agent_surface", "get_ladder_definition", "get_scan_findings", "get_evidence",
  "explain_opportunity", "rescan", "email_report",
]);
const ALLOWED_OUTCOMES = new Set(["ok", "error", "refused"]);

/** Instrumentation endpoint — every WebMCP tool invocation is logged here.
 *  The corpus of what agents ask for (including what doesn't exist) is the
 *  research asset; this is spec principle 6, "instrument from call one". */
export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > 16_384)
    return NextResponse.json({ error: "payload too large" }, { status: 413 });
  try {
    const body = await request.json();
    if (!body.toolName) return NextResponse.json({ error: "toolName required" }, { status: 400 });
    const toolName = String(body.toolName).slice(0, 100);
    const outcome = String(body.outcome ?? "ok").slice(0, 100);
    if (!ALLOWED_TOOLS.has(toolName) || !ALLOWED_OUTCOMES.has(outcome))
      return NextResponse.json({ error: "invalid event" }, { status: 400 });
    const encodedArgs = JSON.stringify(body.arguments ?? null);
    if (encodedArgs.length > 8_192)
      return NextResponse.json({ error: "arguments too large" }, { status: 413 });
    await logAgentHit({
      toolName,
      argumentsJson: body.arguments,
      agentUa: request.headers.get("user-agent") ?? undefined,
      outcome,
      scanId: typeof body.scanId === "number" ? body.scanId : undefined,
      ipHash: requesterHash(request),
    });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Rate limit"))
      return NextResponse.json({ error: error.message }, { status: 429 });
    return NextResponse.json({ error: "event not recorded" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
