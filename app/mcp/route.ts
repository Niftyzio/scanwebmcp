import { handleMcpRequest } from "@/lib/mcp-server";

export const maxDuration = 60;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
      { status: 400 },
    );
  }
  return handleMcpRequest(body, request.headers.get("user-agent"));
}

// No server-initiated stream; clients use POST. (405 per Streamable HTTP spec.)
export function GET() {
  return new Response("Method Not Allowed — POST JSON-RPC to this endpoint.", { status: 405 });
}
