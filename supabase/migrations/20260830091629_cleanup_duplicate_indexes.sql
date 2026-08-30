-- Adopt the original production index names and remove equivalent indexes
-- created while the pre-source-control schema was being baselined.
create index if not exists scans_ip_hash_recent
  on public.scans (requester_ip_hash, created_at desc)
  where requester_ip_hash is not null;
drop index if exists public.scans_ip_recent_idx;

create index if not exists signals_scan_id_idx on public.signals (scan_id);
drop index if exists public.signals_scan_idx;
