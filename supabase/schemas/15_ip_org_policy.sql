create table if not exists public.ip_org_policy (
  id uuid primary key default gen_random_uuid(),
  org_pattern text not null,
  match_mode text not null default 'contains',
  policy_class text not null default 'vpn_hosting_datacenter',
  enabled boolean not null default true,
  note text,
  priority integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ip_org_policy_match_mode_chk check (match_mode in ('exact', 'contains', 'regex')),
  constraint ip_org_policy_class_chk
    check (policy_class in ('infra_proxy', 'consumer_isp', 'vpn_hosting_datacenter', 'trusted_enterprise', 'unknown')),
  constraint ip_org_policy_pattern_unique unique (org_pattern, match_mode)
);

create index if not exists ip_org_policy_enabled_priority_idx
  on public.ip_org_policy (enabled, priority, created_at);

create or replace function public.touch_ip_org_policy_updated_at()
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

drop trigger if exists on_ip_org_policy_updated_set_timestamp on public.ip_org_policy;
create trigger on_ip_org_policy_updated_set_timestamp
before update on public.ip_org_policy
for each row execute function public.touch_ip_org_policy_updated_at();

alter table public.ip_org_policy enable row level security;

drop policy if exists ip_org_policy_read_staff on public.ip_org_policy;
create policy ip_org_policy_read_staff
  on public.ip_org_policy
  for select
  using (public.authorize('profiles.read'));

drop policy if exists ip_org_policy_write_admin on public.ip_org_policy;
create policy ip_org_policy_write_admin
  on public.ip_org_policy
  for all
  using (public.authorize('role_permission.manage'))
  with check (public.authorize('role_permission.manage'));

drop policy if exists ip_org_policy_read_auth_admin on public.ip_org_policy;
create policy ip_org_policy_read_auth_admin
  on public.ip_org_policy
  for select
  to supabase_auth_admin
  using (true);

grant all on table public.ip_org_policy to supabase_auth_admin;
revoke all on table public.ip_org_policy from authenticated, anon, public;
grant select on table public.ip_org_policy to authenticated;
