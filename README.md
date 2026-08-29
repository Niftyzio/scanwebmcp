# Agent Surface Scan

Enter a URL → get a live, dated, evidenced answer to: **which of this business's capabilities could an AI agent call today?**

Built for the [OpenAI WebMCP Challenge](https://webmcp.devpost.com/), Aug–Sep 2026. The scan scores sites against the [Agent Surface Ladder v1.0](content/ladder.md) — Invisible → Readable → Answerable → Callable → Transactable — and the result page is itself a WebMCP surface: open it in ChatGPT's in-app browser and the agent can walk the findings, pull the evidence, and trigger re-scans through registered tools, on the same page you're looking at.

## How it works

- `lib/engine.ts` — the signal engine. Plain-HTTP fetches only (no headless rendering in v0): robots.txt agent directives, llms.txt with soft-404 detection, sitemap, validated MCP endpoint probes (a 200 that serves a login page is not an endpoint), structured-data depth, agent-facing content negotiation, page-set discovery (pricing/services/FAQ/contact/about — capped at 6 pages per scan), forms-as-latent-tools, contact affordances, friction markers.
- Every signal is stored with its evidence URL, snippet, and timestamp. Verdicts are validated content, never bare status codes.
- Rungs are gated (you cannot be Callable while Invisible) and scored against published weights — see the Ladder page.

## Scanner conduct

Public pages only, ≤6 pages per scan, 10s timeouts, private/internal hosts refused, declared user agent (`AgentSurfaceScan/0.1`), robots.txt respected, one scan per domain per day unless a re-scan is requested. Opt-out: see `/opt-out` on the live site.

## Run it

```
npm install
npx tsx scripts/smoke.ts example.com   # CLI smoke test of the engine
npm run dev                            # web app
```

## License

[AGPL-3.0](LICENSE). The Agent Surface Ladder rubric text is © Sara Simeone, published at the live site; the benchmark data collected by the hosted instance is not part of this repository.
