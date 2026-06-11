create or replace function public.normalize_address_fingerprint(
  street_address text,
  city text,
  province text,
  postcode text
)
returns text
language sql
immutable
as $$
  with normalized as (
    select
      nullif(regexp_replace(lower(coalesce(street_address, '')), '\\s+', ' ', 'g'), '') as street,
      nullif(regexp_replace(lower(coalesce(city, '')), '\\s+', ' ', 'g'), '') as city,
      nullif(regexp_replace(lower(coalesce(province, '')), '\\s+', ' ', 'g'), '') as province,
      nullif(regexp_replace(lower(coalesce(postcode, '')), '[^a-z0-9]', '', 'g'), '') as postcode
  )
  select case
    when street is null and city is null and province is null and postcode is null then null
    else concat_ws('|', coalesce(street, ''), coalesce(city, ''), coalesce(province, ''), coalesce(postcode, ''))
  end
  from normalized
$$;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profile'
      and column_name = 'address_fingerprint'
  ) then
    alter table public.profile
      add column address_fingerprint text generated always as (
        public.normalize_address_fingerprint(street_address, city, province, postcode)
      ) stored;
  end if;
end $$;

create index if not exists profile_address_fingerprint_idx
  on public.profile (address_fingerprint);

alter table public.suspicious_signal
  add column if not exists priority_score integer not null default 0,
  add column if not exists priority_reason text;

alter table public.suspicious_signal
  drop constraint if exists suspicious_signal_signal_type_chk;

alter table public.suspicious_signal
  add constraint suspicious_signal_signal_type_chk
  check (
    signal_type in (
      'address_mismatch',
      'network_distance_anomaly',
      'non_whitelisted_riding',
      'cross_family_exact_address',
      'ip_profile_location_mismatch'
    )
  );

create index if not exists suspicious_signal_open_subject_priority_idx
  on public.suspicious_signal (status, subject_profile_id, priority_score desc, created_at desc);

create index if not exists suspicious_signal_open_priority_idx
  on public.suspicious_signal (status, priority_score desc, created_at desc);

update public.suspicious_signal
set
  priority_score =
    case severity
      when 'high' then 300
      when 'medium' then 200
      else 100
    end
    + case signal_type
        when 'ip_profile_location_mismatch' then 40
        when 'cross_family_exact_address' then 30
        when 'network_distance_anomaly' then 20
        when 'address_mismatch' then 10
        when 'non_whitelisted_riding' then 5
        else 0
      end,
  priority_reason = coalesce(
    priority_reason,
    concat('severity=', severity, ';type=', signal_type)
  )
where coalesce(priority_score, 0) = 0;

create table if not exists public.ip_geolocation_cache (
  ip inet primary key,
  country_code text,
  region text,
  city text,
  latitude double precision,
  longitude double precision,
  timezone text,
  source text not null,
  confidence text,
  raw jsonb not null default '{}'::jsonb,
  looked_up_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ip_geolocation_cache_expires_at_idx
  on public.ip_geolocation_cache (expires_at);

create index if not exists ip_geolocation_cache_looked_up_at_idx
  on public.ip_geolocation_cache (looked_up_at desc);

create or replace function public.touch_ip_geolocation_cache_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_ip_geolocation_cache_updated_set_timestamp on public.ip_geolocation_cache;
create trigger on_ip_geolocation_cache_updated_set_timestamp
before update on public.ip_geolocation_cache
for each row execute function public.touch_ip_geolocation_cache_updated_at();

alter table public.ip_geolocation_cache enable row level security;

drop policy if exists ip_geolocation_cache_read_auth_admin on public.ip_geolocation_cache;
create policy ip_geolocation_cache_read_auth_admin
  on public.ip_geolocation_cache
  for select
  to supabase_auth_admin
  using (true);

drop policy if exists ip_geolocation_cache_write_auth_admin on public.ip_geolocation_cache;
create policy ip_geolocation_cache_write_auth_admin
  on public.ip_geolocation_cache
  for all
  to supabase_auth_admin
  using (true)
  with check (true);

drop policy if exists ip_geolocation_cache_read_staff on public.ip_geolocation_cache;
create policy ip_geolocation_cache_read_staff
  on public.ip_geolocation_cache
  for select
  using (public.authorize('profiles.read'));

grant all on table public.ip_geolocation_cache to supabase_auth_admin;
revoke all on table public.ip_geolocation_cache from authenticated, anon, public;
grant select on table public.ip_geolocation_cache to authenticated;
