import { MCP_SERVER_CARD } from "@/lib/agent-discovery";

export function GET() {
  return Response.json(MCP_SERVER_CARD, {
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
      "Content-Type": "application/mcp-server-card+json; charset=utf-8",
    },
  });
}
