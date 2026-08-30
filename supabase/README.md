# Supabase deployment notes

The migrations are safe to adopt on the existing project and provide a complete baseline for clean environments. Apply them with the Supabase CLI after reviewing the target project.

Local seed execution is deliberately disabled in `config.toml`: the benchmark corpus and its composition are private production data. `supabase db reset` recreates the complete schema from migrations without importing production records.

Before applying `schedule_server_jobs_without_plaintext_secrets.sql` to a hosted project:

1. Rotate the existing `CRON_SECRET`; an older scheduler definition stored it inline.
2. In Supabase Vault, create secrets named `app_base_url` (the canonical HTTPS origin) and `cron_secret` (the rotated value).
3. Put the same rotated `CRON_SECRET` in the deployment environment.
4. Apply migrations, then verify `scan-drumbeat` and `email-report-retry` in `cron.job` contain only calls to `private.invoke_scheduled_endpoint`.

The migration does not modify the private `sector-rotation-refill` job. Browser roles receive no table or sequence privileges, all tables have RLS enabled, and the queue claim function is executable only by `service_role`.
