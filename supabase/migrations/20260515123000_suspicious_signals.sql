create table if not exists public.suspicious_signal (
  id uuid primary key default gen_random_uuid(),
  subject_profile_id uuid not null references public.profile(id) on delete cascade,
  family_profile_ids uuid[] not null default '{}'::uuid[],
  signal_type text not null,
  severity text not null,
  summary text not null,
  details jsonb not null default '{}'::jsonb,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  resolution_note text,
  constraint suspicious_signal_signal_type_chk check (signal_type in ('address_mismatch', 'network_distance_anomaly')),
  constraint suspicious_signal_severity_chk check (severity in ('low', 'medium', 'high')),
  constraint suspicious_signal_status_chk check (status in ('open', 'resolved'))
);

create index if not exists suspicious_signal_subject_status_idx
  on public.suspicious_signal (subject_profile_id, status, created_at desc);

create index if not exists suspicious_signal_status_idx
  on public.suspicious_signal (status, created_at desc);

create index if not exists suspicious_signal_family_gin_idx
  on public.suspicious_signal using gin (family_profile_ids);

create or replace function public.touch_suspicious_signal_updated_at()
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

drop trigger if exists on_suspicious_signal_updated_set_timestamp on public.suspicious_signal;
create trigger on_suspicious_signal_updated_set_timestamp
before update on public.suspicious_signal
for each row execute function public.touch_suspicious_signal_updated_at();

alter table public.suspicious_signal enable row level security;

drop policy if exists suspicious_signal_read_auth_admin on public.suspicious_signal;
create policy suspicious_signal_read_auth_admin
  on public.suspicious_signal
  for select
  to supabase_auth_admin
  using (true);

drop policy if exists suspicious_signal_write_auth_admin on public.suspicious_signal;
create policy suspicious_signal_write_auth_admin
  on public.suspicious_signal
  for all
  to supabase_auth_admin
  using (true)
  with check (true);

drop policy if exists suspicious_signal_read_staff on public.suspicious_signal;
create policy suspicious_signal_read_staff
  on public.suspicious_signal
  for select
  using (public.authorize('profiles.read'));

grant all on table public.suspicious_signal to supabase_auth_admin;
revoke all on table public.suspicious_signal from authenticated, anon, public;
grant select on table public.suspicious_signal to authenticated;
