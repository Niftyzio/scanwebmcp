# Contributing

Thanks for helping improve Agent Surface Scan. Keep changes small, evidenced and safe to reproduce.

## Development setup

1. Use Node 24 (`nvm use`).
2. Run `npm ci`.
3. Copy `.env.local.example` to `.env.local` and use a local or development Supabase project—never production credentials.
4. Run `npm run check` before opening a pull request.

## Security and privacy rules

- Never commit secrets, `.env` files, report-access links, private scan lists or production data.
- Keep `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `REPORT_ACCESS_SECRET`, Resend keys and browser tokens server-only.
- The email gate must remain enabled by default. Any change to report access or `email_report` consent requires tests for both browser and agent paths.
- Scanner changes must preserve public-network-only fetching, DNS/redirect validation, bounded response bodies and bounded timeouts.
- Do not add corpus seed lists. Local Supabase resets intentionally create schema only.
- Report vulnerabilities through `SECURITY.md`, not a public issue.

## Database changes

Do not edit, rename or squash migrations already applied to production. Create a new migration with the current Supabase CLI, review it, run a local `supabase db reset`, and include the migration in the same pull request as the code that needs it.

## Pull requests

- Explain the user-visible outcome and security implications.
- Add or update tests for changed behavior.
- Commit `package-lock.json` whenever dependencies change.
- Keep generated files, local launch settings and unrelated formatting out of the change.
