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
