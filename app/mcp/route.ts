import { handleMcpRequest } from "@/lib/mcp-server";
import { requesterHash } from "@/lib/request-identity";

export const maxDuration = 60;

export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > 65_536)
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Request too large" } }, { status: 413 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
      { status: 400 },
    );
  }
  if (Array.isArray(body) && body.length > 20)
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Batch too large" } }, { status: 400 });
  return handleMcpRequest(body, {
    ua: request.headers.get("user-agent"),
    ipHash: requesterHash(request),
  });
}

// No server-initiated stream; clients use POST. (405 per Streamable HTTP spec.)
export function GET() {
  return new Response("Method Not Allowed — POST JSON-RPC to this endpoint.", { status: 405 });
}
