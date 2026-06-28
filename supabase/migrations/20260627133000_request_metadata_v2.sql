alter table public.form_submission
  add column if not exists ip_selected inet,
  add column if not exists ip_selected_source text,
  add column if not exists ip_chain jsonb not null default '[]'::jsonb,
  add column if not exists ip_parse_version integer not null default 1,
  add column if not exists ip_parse_confidence text not null default 'unknown',
  add column if not exists ip_parse_notes jsonb not null default '{}'::jsonb,
  add column if not exists request_headers jsonb not null default '{}'::jsonb;

create index if not exists form_submission_ip_selected_idx
  on public.form_submission (ip_selected);

alter table public.login_event
  add column if not exists ip_selected inet,
  add column if not exists ip_selected_source text,
  add column if not exists ip_chain jsonb not null default '[]'::jsonb,
  add column if not exists ip_parse_version integer not null default 1,
  add column if not exists ip_parse_confidence text not null default 'unknown',
  add column if not exists ip_parse_notes jsonb not null default '{}'::jsonb,
  add column if not exists request_headers jsonb not null default '{}'::jsonb;

create index if not exists login_event_ip_selected_idx
  on public.login_event (ip_selected);

create table if not exists public.network_proxy_range (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  cidr cidr not null,
  ip_family integer not null,
  version_tag text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (provider, cidr),
  check (ip_family in (4, 6))
);

create index if not exists network_proxy_range_provider_idx
  on public.network_proxy_range (provider);

create index if not exists network_proxy_range_cidr_gist_idx
  on public.network_proxy_range using gist (cidr inet_ops);

alter table public.network_proxy_range enable row level security;

drop policy if exists network_proxy_range_read_staff on public.network_proxy_range;
create policy network_proxy_range_read_staff
  on public.network_proxy_range
  for select
  using (public.authorize('profiles.read'));

drop policy if exists network_proxy_range_write_admin on public.network_proxy_range;
create policy network_proxy_range_write_admin
  on public.network_proxy_range
  for all
  using (public.authorize('role_permission.manage'))
  with check (public.authorize('role_permission.manage'));

drop policy if exists network_proxy_range_read_auth_admin on public.network_proxy_range;
create policy network_proxy_range_read_auth_admin
  on public.network_proxy_range
  for select
  to supabase_auth_admin
  using (true);

grant all on table public.network_proxy_range to supabase_auth_admin;
revoke all on table public.network_proxy_range from authenticated, anon, public;
grant select on table public.network_proxy_range to authenticated;
