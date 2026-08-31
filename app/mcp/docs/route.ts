import { handleDocsMcpRequest } from "@/lib/docs-mcp-server";

export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > 65_536) {
    return Response.json(
      { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Request too large" } },
      { status: 413 },
    );
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
      { status: 400 },
    );
  }
  if (Array.isArray(body) && body.length > 20) {
    return Response.json(
      { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Batch too large" } },
      { status: 400 },
    );
  }
  return handleDocsMcpRequest(body);
}

export function GET() {
  return new Response("Method Not Allowed — POST JSON-RPC to this endpoint.", { status: 405 });
}
