-- Recovery runs on every queue claim, so keep both stale-row lookups narrow.
create index if not exists scans_running_started_idx
  on public.scans (started_at) where status = 'running';
create index if not exists scan_queue_running_recovery_idx
  on public.scan_queue ((coalesce(processed_at, queued_at))) where status = 'running';

create or replace function public.claim_scan_queue(batch_size integer default 1)
returns setof public.scan_queue
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- A serverless timeout can end the request before its catch block runs.
  -- Close the orphan scan before returning its queue item for another attempt.
  update public.scans
  set status = 'failed',
      completed_at = now(),
      error = coalesce(error, 'Scan worker timed out before completion.')
  where status = 'running'
    and started_at < now() - interval '15 minutes';

  -- Older rows may have a NULL processed_at. queued_at is the safe fallback,
  -- otherwise SQL's NULL comparison leaves them running forever.
  update public.scan_queue
  set status = case when attempts >= 3 then 'failed' else 'pending' end,
      error = 'stale_claim_recovered'
  where status = 'running'
    and coalesce(processed_at, queued_at) < now() - interval '15 minutes';

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
