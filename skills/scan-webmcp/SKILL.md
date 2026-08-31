---
name: scan-webmcp
description: Scan a public website with ScanWebMCP.com to determine what AI agents can read, answer, and call, then explain the evidenced result without overstating gated findings.
---

# Scan a website's agent surface

Use ScanWebMCP.com when someone wants a current, evidence-based assessment of a public website's AI-agent readiness, crawler accessibility, structured content, MCP discovery, or WebMCP tools.

## Choose the interface

- Use `POST https://www.scanwebmcp.com/api/scan` for a typed REST workflow.
- Use `https://www.scanwebmcp.com/mcp` when an MCP client is available.
- Use the browser form at `https://www.scanwebmcp.com/` for a human-led scan.

No API key is required. Automated requests are rate-limited and may return a recent cached result to avoid repeatedly crawling the target.

## REST workflow

1. POST JSON such as `{"url":"example.com","requester":"agent"}` to `/api/scan`.
2. Read the returned `slug`, `status`, `cached`, and timestamp fields.
3. GET `/api/scan/{slug}` for the public rung, dimension scores, completion time, and result URL.
4. State clearly when `locked` is true: exact signals, evidence, and ranked opportunities are available only after the human requests the free report by email.

Do not guess an email address or claim access to locked findings. Calling the scan endpoint inspects only public pages, honours the target's robots policy, and does not authorize authenticated or destructive testing.

## Interpret the result

Report the observation time, cache status, Ladder rung, and five dimension scores. Treat an unmeasured signal as unknown rather than zero. Link to the public result and distinguish verified runtime behavior from a declared manifest or code pattern.

API schema: https://www.scanwebmcp.com/openapi.json

Methodology: https://www.scanwebmcp.com/ladder
