revoke all privileges on all tables in schema public from anon, authenticated;
revoke all privileges on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

create index if not exists agent_hits_scan_id_idx on public.agent_hits (scan_id);
create index if not exists leads_scan_id_idx on public.leads (scan_id);
create index if not exists scans_site_completed_idx
  on public.scans (site_id, completed_at desc) where status = 'complete';
create index if not exists scans_complete_created_idx
  on public.scans (created_at desc) where status = 'complete';
create index if not exists scan_queue_pending_claim_idx
  on public.scan_queue (id) where status = 'pending' and attempts < 3;

-- Superseded by the composite/partial indexes above and in the baseline.
drop index if exists public.scans_site_id_idx;
drop index if exists public.opportunities_scan_id_idx;
drop index if exists public.scan_queue_pending;
drop index if exists public.scan_queue_pending_idx;

alter table public.agent_hits add column if not exists requester_ip_hash text;
create index if not exists agent_hits_ip_recent_idx
  on public.agent_hits (requester_ip_hash, at desc) where requester_ip_hash is not null;

alter table public.leads
  add column if not exists marketing_consent boolean not null default false,
  add column if not exists consent_requested_at timestamptz,
  add column if not exists marketing_confirmed_at timestamptz,
  add column if not exists confirmation_token_hash text,
  add column if not exists report_delivery_key uuid not null default gen_random_uuid(),
  add column if not exists delivery_attempts integer not null default 0,
  add column if not exists last_delivery_attempt_at timestamptz;
create unique index if not exists leads_confirmation_token_hash_idx
  on public.leads (confirmation_token_hash) where confirmation_token_hash is not null;
create unique index if not exists leads_report_delivery_key_idx on public.leads (report_delivery_key);
create index if not exists leads_pending_delivery_idx
  on public.leads (last_delivery_attempt_at, created_at) where report_sent = false;
drop index if exists public.leads_pending;

create or replace function public.claim_scan_queue(batch_size integer default 1)
returns setof public.scan_queue
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.scan_queue
  set status = case when attempts >= 3 then 'failed' else 'pending' end,
      error = 'stale_claim_recovered'
  where status = 'running'
    and processed_at < now() - interval '15 minutes';

  return query
    with claimed as (
      select q.id
      from public.scan_queue as q
      where q.status = 'pending' and q.attempts < 3
      order by q.id
      for update skip locked
      limit least(greatest(batch_size, 1), 2)
    )
    update public.scan_queue as q
    set status = 'running', attempts = q.attempts + 1, processed_at = now()
    from claimed
    where q.id = claimed.id
    returning q.*;
end;
$$;

revoke all on function public.claim_scan_queue(integer) from public, anon, authenticated;
grant execute on function public.claim_scan_queue(integer) to service_role;

create or replace function public.consume_rate_limit(
  requested_kind text,
  requested_hash text,
  maximum_events integer,
  window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent_count integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(requested_kind || ':' || requested_hash, 0)
  );
  delete from public.rate_limit_events as event
  where event.event_kind = requested_kind
    and event.requester_hash = requested_hash
    and event.created_at < now() - pg_catalog.make_interval(secs => greatest(window_seconds, 1));
  select count(*) into recent_count
  from public.rate_limit_events as event
  where event.event_kind = requested_kind
    and event.requester_hash = requested_hash
    and event.created_at >= now() - pg_catalog.make_interval(secs => greatest(window_seconds, 1));
  if recent_count >= greatest(maximum_events, 1) then
    return false;
  end if;
  insert into public.rate_limit_events (event_kind, requester_hash)
  values (requested_kind, requested_hash);
  return true;
end;
$$;

revoke all on function public.consume_rate_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, text, integer, integer) to service_role;
