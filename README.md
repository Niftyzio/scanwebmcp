# ScanWebMCP.com

Enter a URL and get a dated, evidenced answer to: **which of this business's capabilities can an AI agent call today?**

The scan scores public websites against the [Agent Surface Ladder v1.0](content/ladder.md): Invisible → Readable → Answerable → Callable → Transactable. Result pages expose a public summary through WebMCP tools. Full findings and evidence become available to the page and its agent tools only after the visitor requests the report by email.

## What the scanner verifies

- Public-network HTTP only. DNS answers are checked and pinned; private, reserved and internal ranges are refused on the initial request and every redirect.
- `robots.txt` is parsed and enforced for `AgentSurfaceScan`, including wildcard groups and path-level Allow/Disallow precedence.
- `llms.txt`, sitemap, server-rendered content, structured data and a same-origin page set capped at six pages.
- MCP only counts after a real `initialize` and `tools/list` exchange returns tools.
- WebMCP only counts after the browser protocol witnesses live registrations. A manifest or code pattern is stored as an unverified declaration and does not raise the rung.
- Every signal is stored with its evidence URL, bounded public snippet and observation time.

The public scan caps at Callable. Transactable requires a separately consented end-to-end invocation, because the scanner will not place orders, make bookings or submit third-party forms uninvited.

Outbound work is parallelised and individually bounded so a scan remains inside the 60-second route budget. Renderer failure becomes an explicit unmeasured signal and a recoverable queue item.

## Local development

Node 24 is required.

```sh
nvm use
npm ci
cp .env.local.example .env.local
npm run dev
```

Useful checks:

```sh
npm test
npm run typecheck
npm run build
npm run check
npx tsx scripts/smoke.ts example.com
```

## WebMCP eval pack

The committed [WebMCP agent eval pack](evals/README.md) contains 12 scenarios
covering tool selection, parameter mapping, call ordering, full journeys,
consent and mid-chain failure. Its `expectedCall` format follows Chrome's
[WebMCP eval guidance](https://developer.chrome.com/docs/ai/webmcp/evals), and a
deterministic test keeps every scenario aligned with the tool names actually
published by the browser surface.

```sh
npm run test:evals
```

## Database and scheduled jobs

The complete baseline and forward migrations live in [`supabase/migrations`](supabase/migrations). For a fresh local database, install Docker and run:

```sh
supabase start
supabase db reset
```

The hosted scheduler calls the protected scan and email-retry routes. Its bearer value is read from Supabase Vault rather than embedded in `cron.job`; see [`supabase/README.md`](supabase/README.md) before applying the scheduling migration.

## Email and privacy

The score, rung and dimension summary remain public. Full findings, timestamped evidence and ranked recommendations are server-gated by default: they are not rendered into the locked page or returned by its scan API. After a report request is captured, a signed per-report cookie unlocks the browser and the email contains a time-limited signed link to the same report. WebMCP and MCP tools stop at the same wall and instruct the assistant to ask whether the human wants the report emailed before requesting an address or calling `email_report`.

Report delivery is transactional and stored before sending. Failed delivery is truthfully returned as queued and retried with a stable provider idempotency key. Benchmark updates are a separate unchecked opt-in and remain disabled until the recipient confirms by email. Raw IP addresses are never stored; salted hashes are used only for shared rate limits. Production requires an independent `REPORT_ACCESS_SECRET`; `REPORT_GATE=off` is reserved for an intentional open-report campaign.

## License

The source code is licensed under [AGPL-3.0](LICENSE), except for expressly marked content. The Agent Surface Ladder's authored rubric text is © 2026 Sara Simeone, all rights reserved, under its [separate content terms](LICENSES/LicenseRef-Agent-Surface-Ladder.txt). See [NOTICE.md](NOTICE.md) for the exact boundary and the treatment of earlier releases. The hosted benchmark corpus and its private seed composition are not part of this repository.

## Contributing and security

See [CONTRIBUTING.md](CONTRIBUTING.md) for the local workflow and privacy requirements. Report suspected vulnerabilities privately using [SECURITY.md](SECURITY.md), not a public issue.
