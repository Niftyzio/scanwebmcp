/** MCP discovery document — also what our own D3 probe validates. */
export function GET() {
  return Response.json({
    mcpVersion: "2025-06-18",
    servers: [
      {
        name: "agent-surface-scan",
        description:
          "Scan any website for AI-agent readiness against the Agent Surface Ladder v1.0.",
        transport: "streamable-http",
        endpoint: "https://scanwebmcp.vercel.app/mcp",
        authentication: "none",
      },
    ],
  });
}
