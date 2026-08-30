# Security policy

## Supported version

Security fixes are applied to the current `main` branch and the production deployment at <https://scanwebmcp.vercel.app>.

## Reporting a vulnerability

Do not open a public issue for a suspected vulnerability. Email `sara@nocodelab.ai` with the subject `Security report: Agent Surface Scan` and include:

- the affected route, component or commit;
- the impact and conditions required to reproduce it;
- minimal reproduction steps or a proof of concept; and
- any mitigation you have already identified.

Do not send credentials, API keys, report-access links, personal data or production database records. If sensitive supporting material is necessary, first ask for a secure transfer method.

Particularly relevant areas include SSRF or redirect bypasses in the scanner, report-gate bypasses, unauthorized email delivery, MCP/WebMCP actions without human consent, rate-limit bypasses, and exposure of Supabase or Vercel credentials.

We will acknowledge a complete report, investigate it privately, and coordinate disclosure after a fix is available. Please avoid accessing data that is not yours, degrading the service, or testing against third-party sites without permission.
