create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

-- The job definitions contain only this function call. Runtime values come
-- from Vault secrets named app_base_url and cron_secret, so neither appears in
-- cron.job, migrations, logs, nor source control.
create or replace function private.invoke_scheduled_endpoint(endpoint_path text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  base_url text;
  bearer_secret text;
begin
  select decrypted_secret into base_url
  from vault.decrypted_secrets
  where name = 'app_base_url'
  order by created_at desc
  limit 1;

  select decrypted_secret into bearer_secret
  from vault.decrypted_secrets
  where name = 'cron_secret'
  order by created_at desc
  limit 1;

  if base_url is null or bearer_secret is null then
    raise warning 'Scheduled endpoint skipped: app_base_url or cron_secret is missing from Vault';
    return null;
  end if;

  return net.http_get(
    url := rtrim(base_url, '/') || endpoint_path,
    headers := jsonb_build_object('Authorization', 'Bearer ' || bearer_secret),
    timeout_milliseconds := 5000
  );
end;
$$;

revoke all on function private.invoke_scheduled_endpoint(text) from public, anon, authenticated;

-- Replace the original plaintext-bearing job, then add delivery recovery.
select cron.unschedule(jobid) from cron.job where jobname = 'scan-drumbeat';
select cron.unschedule(jobid) from cron.job where jobname = 'email-report-retry';
select cron.schedule(
  'scan-drumbeat',
  '*/10 * * * *',
  $$select private.invoke_scheduled_endpoint('/api/cron/scan-batch')$$
);
select cron.schedule(
  'email-report-retry',
  '*/10 * * * *',
  $$select private.invoke_scheduled_endpoint('/api/cron/email-retry')$$
);
