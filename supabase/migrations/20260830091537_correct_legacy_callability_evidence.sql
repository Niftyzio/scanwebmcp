-- Legacy scans treated plausible JSON and page manifests as callable. Preserve
-- the observation, downgrade the claim, and recompute the affected scores.
create temporary table affected_callability_scans (scan_id bigint primary key) on commit drop;

insert into affected_callability_scans (scan_id)
select distinct scan_id
from public.signals
where (signal_key in ('mcp_probe_well_known', 'mcp_probe_path') and value_text = 'plausible_endpoint')
   or (signal_key = 'webmcp_registration' and value_text in ('manifest_found', 'registration_code_found'))
   or (signal_key = 'webmcp_registration' and value_text = 'active_tools_found' and exists (
     select 1 from public.signals as legacy_tools
     where legacy_tools.scan_id = signals.scan_id
       and legacy_tools.signal_key = 'webmcp_tools_found'
       and legacy_tools.evidence_snippet like 'Declared tool manifest:%'
   ))
   or (signal_key = 'webmcp_tools_found' and evidence_snippet like 'Declared tool manifest:%')
on conflict do nothing;

update public.signals
set value_bool = false,
    value_text = 'legacy_plausible_unverified'
where signal_key in ('mcp_probe_well_known', 'mcp_probe_path')
  and value_text = 'plausible_endpoint';

update public.signals
set value_bool = false,
    value_text = case value_text
      when 'manifest_found' then 'manifest_declared_unverified'
      else 'registration_code_unverified'
    end
where signal_key = 'webmcp_registration'
  and value_text in ('manifest_found', 'registration_code_found');

update public.signals
set value_bool = false,
    value_text = 'manifest_declared_unverified'
where signals.signal_key = 'webmcp_registration'
  and signals.value_text = 'active_tools_found'
  and exists (
    select 1 from public.signals as legacy_tools
    where legacy_tools.scan_id = signals.scan_id
      and legacy_tools.signal_key = 'webmcp_tools_found'
      and legacy_tools.evidence_snippet like 'Declared tool manifest:%'
  );

-- The old tools row stored only a declared-manifest snippet even when its
-- registration verdict said active. Without durable live-registration proof,
-- retain it as a declaration and let the next scan establish fresh evidence.
update public.signals as tools
set signal_key = 'webmcp_tools_declared',
    evidence_snippet = replace(tools.evidence_snippet, 'Declared tool manifest:', 'Unverified page manifest:')
where tools.signal_key = 'webmcp_tools_found'
  and tools.evidence_snippet like 'Declared tool manifest:%';

with evidence as (
  select
    affected.scan_id,
    least(
      least(coalesce(max(signal.value_num) filter (where signal.signal_key = 'forms_as_latent_tools'), 0) * 10, 30)
      + case when bool_or(coalesce(signal.value_bool, false)) filter (where signal.signal_key = 'booking_embed') then 20 else 0 end
      + case when bool_or(coalesce(signal.value_bool, false)) filter (where signal.signal_key in ('mcp_probe_well_known', 'mcp_probe_path')) then 50 else 0 end
      + case when coalesce(max(signal.value_num) filter (where signal.signal_key = 'webmcp_tools_found'), 0) > 0 then 50 else 0 end,
      100
    ) as new_d3,
    count(*) filter (
      where signal.signal_key in ('robots_gptbot', 'robots_claudebot', 'robots_google_extended', 'robots_perplexitybot')
        and signal.value_text = 'blocked'
    ) as blocked_bots,
    bool_or(coalesce(signal.value_bool, false)) filter (
      where signal.signal_key in ('mcp_probe_well_known', 'mcp_probe_path')
    ) or coalesce(max(signal.value_num) filter (where signal.signal_key = 'webmcp_tools_found'), 0) > 0 as callable
  from affected_callability_scans as affected
  join public.signals as signal on signal.scan_id = affected.scan_id
  group by affected.scan_id
), recalculated as (
  select
    scan.id,
    evidence.new_d3,
    round(
      scan.d1 * 0.25 + scan.d2 * 0.30 + evidence.new_d3 * 0.20
      + scan.d4 * 0.15 + scan.d5 * 0.10
    ) as new_composite,
    case
      when scan.d1 >= 40 and evidence.blocked_bots < 3 and evidence.callable then 3
      when scan.d1 >= 40 and evidence.blocked_bots < 3 and scan.d2 >= 50 then 2
      when scan.d1 >= 40 and evidence.blocked_bots < 3 then 1
      else 0
    end as new_rung
  from public.scans as scan
  join evidence on evidence.scan_id = scan.id
  where scan.status = 'complete' and scan.rubric_version = '1.0.0'
)
update public.scans as scan
set d3 = recalculated.new_d3,
    composite = recalculated.new_composite,
    rung = recalculated.new_rung
from recalculated
where scan.id = recalculated.id;
