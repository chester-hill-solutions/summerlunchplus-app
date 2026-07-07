create type public.email_change_status as enum (
  'pending',
  'applied',
  'partial',
  'failed'
);

create table public.email_change_log (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profile(id) on update cascade on delete restrict,
  user_id uuid references auth.users(id) on update cascade on delete set null,
  old_email text not null,
  new_email text not null,
  changed_by uuid not null references auth.users(id) on update cascade on delete restrict,
  reason text not null,
  status public.email_change_status not null default 'pending',
  auth_updated boolean not null default false,
  profile_updated boolean not null default false,
  invites_updated boolean not null default false,
  invite_rows_updated integer not null default 0,
  zoom_sync_started_at timestamptz,
  zoom_sync_completed_at timestamptz,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_change_log_reason_not_blank_chk check (length(trim(reason)) > 0),
  constraint email_change_log_invite_rows_non_negative_chk check (invite_rows_updated >= 0)
);

create index email_change_log_profile_created_idx
  on public.email_change_log (profile_id, created_at desc);

create index email_change_log_user_created_idx
  on public.email_change_log (user_id, created_at desc);

create index email_change_log_status_created_idx
  on public.email_change_log (status, created_at desc);

create index email_change_log_changed_by_created_idx
  on public.email_change_log (changed_by, created_at desc);

create or replace function public.touch_email_change_log_updated_at()
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

drop trigger if exists on_email_change_log_updated_set_timestamp on public.email_change_log;
create trigger on_email_change_log_updated_set_timestamp
before update on public.email_change_log
for each row execute function public.touch_email_change_log_updated_at();

alter table public.email_change_log enable row level security;

create policy email_change_log_read_admin
  on public.email_change_log
  for select
  using (public.current_user_role() = 'admin'::public.app_role);

create policy email_change_log_insert_admin
  on public.email_change_log
  for insert
  with check (public.current_user_role() = 'admin'::public.app_role);

create policy email_change_log_update_admin
  on public.email_change_log
  for update
  using (public.current_user_role() = 'admin'::public.app_role)
  with check (public.current_user_role() = 'admin'::public.app_role);

create policy email_change_log_read_auth_admin
  on public.email_change_log
  for select
  to supabase_auth_admin
  using (true);

create policy email_change_log_insert_auth_admin
  on public.email_change_log
  for insert
  to supabase_auth_admin
  with check (true);

create policy email_change_log_update_auth_admin
  on public.email_change_log
  for update
  to supabase_auth_admin
  using (true)
  with check (true);

grant usage on type public.email_change_status to authenticated, supabase_auth_admin;

grant all on table public.email_change_log to supabase_auth_admin;
revoke all on table public.email_change_log from authenticated, anon, public;
grant select, insert, update on table public.email_change_log to authenticated;
