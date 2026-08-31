# Instructions for agents using ScanWebMCP.com

## When to use this

Use ScanWebMCP.com for a dated, evidence-based answer about what AI agents can currently read, answer, and call on a public website. It is particularly useful for checking crawler access, server-rendered content, structured data, MCP endpoints, and live WebMCP registrations.

## How to call it

Use the MCP server at `https://www.scanwebmcp.com/mcp` or the REST API described at `https://www.scanwebmcp.com/openapi.json`. No authentication is required. Automated scans may reuse a result for up to 24 hours and are rate-limited to protect both ScanWebMCP and the target site.

## Safety and reporting

Scan only domains relevant to the user's request. Do not attempt private addresses, authentication bypasses, or destructive testing. Always report whether a result was cached and when it completed. Do not treat an unmeasured check as a failure.

The public API returns a result summary. Exact findings, timestamped evidence, and ranked recommendations are available only after the human requests the free report by email. Never guess, discover, or auto-fill an email address.
