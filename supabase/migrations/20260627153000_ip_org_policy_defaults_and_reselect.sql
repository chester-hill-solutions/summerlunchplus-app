insert into public.ip_org_policy (org_pattern, match_mode, policy_class, enabled, note, priority)
values
  ('cloudflare', 'contains', 'infra_proxy', true, 'Cloudflare proxy/edge infrastructure', 10),
  ('datacamp', 'contains', 'vpn_hosting_datacenter', true, 'Greylist for manual review', 20)
on conflict (org_pattern, match_mode)
do update set
  policy_class = excluded.policy_class,
  enabled = excluded.enabled,
  note = excluded.note,
  priority = excluded.priority,
  updated_at = now();

with ranked_candidates as (
  select
    fs.id,
    candidate.ip_value,
    candidate.idx,
    coalesce(candidate.policy_class, 'unknown') as policy_class,
    row_number() over (
      partition by fs.id
      order by
        case coalesce(candidate.policy_class, 'unknown')
          when 'consumer_isp' then 0
          when 'trusted_enterprise' then 1
          when 'vpn_hosting_datacenter' then 2
          when 'unknown' then 3
          when 'infra_proxy' then 4
          else 5
        end,
        candidate.idx
    ) as rank
  from public.form_submission fs
  cross join lateral (
    select
      elem.value as ip_value,
      elem.ordinality - 1 as idx,
      (
        select p.policy_class
        from public.ip_org_policy p
        where p.enabled = true
          and geo.org is not null
          and (
            (p.match_mode = 'exact' and lower(geo.org) = lower(p.org_pattern))
            or (p.match_mode = 'contains' and lower(geo.org) like ('%' || lower(p.org_pattern) || '%'))
            or (p.match_mode = 'regex' and geo.org ~* p.org_pattern)
          )
        order by p.priority asc
        limit 1
      ) as policy_class
    from jsonb_array_elements_text(fs.ip_chain) with ordinality as elem(value, ordinality)
    left join public.ip_geolocation_cache geo on geo.ip = elem.value::inet
  ) as candidate
),
current_selected as (
  select
    fs.id,
    coalesce((
      select p.policy_class
      from public.ip_org_policy p
      where p.enabled = true
        and geo.org is not null
        and (
          (p.match_mode = 'exact' and lower(geo.org) = lower(p.org_pattern))
          or (p.match_mode = 'contains' and lower(geo.org) like ('%' || lower(p.org_pattern) || '%'))
          or (p.match_mode = 'regex' and geo.org ~* p.org_pattern)
        )
      order by p.priority asc
      limit 1
    ), 'unknown') as selected_policy_class
  from public.form_submission fs
  left join public.ip_geolocation_cache geo on geo.ip = fs.ip_selected
),
best_candidates as (
  select rc.id, rc.ip_value, rc.policy_class
  from ranked_candidates rc
  where rc.rank = 1
)
update public.form_submission fs
set
  ip_selected = bc.ip_value::inet,
  ip_address = bc.ip_value::inet,
  ip_selected_source = 'ip-chain[policy-reselect]',
  ip_parse_notes = jsonb_set(coalesce(fs.ip_parse_notes, '{}'::jsonb), '{policy_reselect}', 'true'::jsonb, true)
from best_candidates bc
join current_selected cs on cs.id = bc.id
where fs.id = bc.id
  and cs.selected_policy_class = 'infra_proxy'
  and bc.policy_class <> 'infra_proxy'
  and fs.ip_chain is not null
  and jsonb_typeof(fs.ip_chain) = 'array'
  and jsonb_array_length(fs.ip_chain) > 0;

with ranked_candidates as (
  select
    le.id,
    candidate.ip_value,
    candidate.idx,
    coalesce(candidate.policy_class, 'unknown') as policy_class,
    row_number() over (
      partition by le.id
      order by
        case coalesce(candidate.policy_class, 'unknown')
          when 'consumer_isp' then 0
          when 'trusted_enterprise' then 1
          when 'vpn_hosting_datacenter' then 2
          when 'unknown' then 3
          when 'infra_proxy' then 4
          else 5
        end,
        candidate.idx
    ) as rank
  from public.login_event le
  cross join lateral (
    select
      elem.value as ip_value,
      elem.ordinality - 1 as idx,
      (
        select p.policy_class
        from public.ip_org_policy p
        where p.enabled = true
          and geo.org is not null
          and (
            (p.match_mode = 'exact' and lower(geo.org) = lower(p.org_pattern))
            or (p.match_mode = 'contains' and lower(geo.org) like ('%' || lower(p.org_pattern) || '%'))
            or (p.match_mode = 'regex' and geo.org ~* p.org_pattern)
          )
        order by p.priority asc
        limit 1
      ) as policy_class
    from jsonb_array_elements_text(le.ip_chain) with ordinality as elem(value, ordinality)
    left join public.ip_geolocation_cache geo on geo.ip = elem.value::inet
  ) as candidate
),
current_selected as (
  select
    le.id,
    coalesce((
      select p.policy_class
      from public.ip_org_policy p
      where p.enabled = true
        and geo.org is not null
        and (
          (p.match_mode = 'exact' and lower(geo.org) = lower(p.org_pattern))
          or (p.match_mode = 'contains' and lower(geo.org) like ('%' || lower(p.org_pattern) || '%'))
          or (p.match_mode = 'regex' and geo.org ~* p.org_pattern)
        )
      order by p.priority asc
      limit 1
    ), 'unknown') as selected_policy_class
  from public.login_event le
  left join public.ip_geolocation_cache geo on geo.ip = le.ip_selected
),
best_candidates as (
  select rc.id, rc.ip_value, rc.policy_class
  from ranked_candidates rc
  where rc.rank = 1
)
update public.login_event le
set
  ip_selected = bc.ip_value::inet,
  ip_address = bc.ip_value::inet,
  ip_selected_source = 'ip-chain[policy-reselect]',
  ip_parse_notes = jsonb_set(coalesce(le.ip_parse_notes, '{}'::jsonb), '{policy_reselect}', 'true'::jsonb, true)
from best_candidates bc
join current_selected cs on cs.id = bc.id
where le.id = bc.id
  and cs.selected_policy_class = 'infra_proxy'
  and bc.policy_class <> 'infra_proxy'
  and le.ip_chain is not null
  and jsonb_typeof(le.ip_chain) = 'array'
  and jsonb_array_length(le.ip_chain) > 0;
