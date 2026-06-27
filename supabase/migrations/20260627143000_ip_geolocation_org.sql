alter table public.ip_geolocation_cache
  add column if not exists org text;

create index if not exists ip_geolocation_cache_org_idx
  on public.ip_geolocation_cache (org);

update public.ip_geolocation_cache
set org = nullif(
  coalesce(
    nullif(raw->>'org', ''),
    nullif(raw->>'organization', ''),
    nullif(raw->>'asn_org', ''),
    nullif(raw->>'as_name', ''),
    nullif(trim(concat_ws(' ', nullif(raw->>'asn', ''), nullif(raw->>'asname', ''))), '')
  ),
  ''
)
where org is null
  and raw is not null;
