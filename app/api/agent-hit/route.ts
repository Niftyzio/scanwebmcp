import { NextResponse } from "next/server";
import { logAgentHit } from "@/lib/scan-service";

/** Instrumentation endpoint — every WebMCP tool invocation is logged here.
 *  The corpus of what agents ask for (including what doesn't exist) is the
 *  research asset; this is spec principle 6, "instrument from call one". */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.toolName) return NextResponse.json({ error: "toolName required" }, { status: 400 });
    await logAgentHit({
      toolName: String(body.toolName).slice(0, 100),
      argumentsJson: body.arguments,
      agentUa: request.headers.get("user-agent") ?? undefined,
      outcome: String(body.outcome ?? "ok").slice(0, 100),
      scanId: typeof body.scanId === "number" ? body.scanId : undefined,
    });
  } catch {
    // Logging must never break the page.
  }
  return NextResponse.json({ ok: true });
}
