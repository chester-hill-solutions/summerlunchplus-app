create table public.zoom_job_run (
  id uuid primary key default gen_random_uuid(),
  run_id text not null,
  trigger_source text not null,
  trigger_kind text not null,
  actor_user_id uuid references auth.users (id) on update cascade on delete set null,
  actor_role text,
  status text not null default 'started',
  context jsonb not null default '{}'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (trigger_source in ('scheduler', 'internal', 'ui', 'manual', 'unknown')),
  check (status in ('started', 'succeeded', 'failed', 'skipped'))
);

create table public.zoom_job_attempt (
  id uuid primary key default gen_random_uuid(),
  zoom_job_run_id uuid references public.zoom_job_run (id) on update cascade on delete cascade,
  run_id text not null,
  action_type text not null,
  trigger_source text not null,
  trigger_kind text not null,
  status text not null default 'started',
  class_id uuid references public.class (id) on update cascade on delete set null,
  profile_id uuid references public.profile (id) on update cascade on delete set null,
  class_zoom_meeting_id uuid references public.class_zoom_meeting (id) on update cascade on delete set null,
  class_zoom_registrant_id uuid references public.class_zoom_registrant (id) on update cascade on delete set null,
  request_payload jsonb not null default '{}'::jsonb,
  result_payload jsonb not null default '{}'::jsonb,
  error_payload jsonb not null default '{}'::jsonb,
  external_request_payload jsonb not null default '{}'::jsonb,
  external_response_payload jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  duration_ms integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (trigger_source in ('scheduler', 'internal', 'ui', 'manual', 'unknown')),
  check (status in ('started', 'succeeded', 'failed', 'skipped'))
);

create table public.zoom_job_attempt_event (
  id uuid primary key default gen_random_uuid(),
  zoom_job_attempt_id uuid not null references public.zoom_job_attempt (id) on update cascade on delete cascade,
  event_type text not null,
  status text not null default 'info',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (status in ('info', 'warning', 'error'))
);

create index zoom_job_run_run_id_idx on public.zoom_job_run (run_id, created_at desc);
create index zoom_job_run_status_idx on public.zoom_job_run (status, created_at desc);
create index zoom_job_attempt_run_id_idx on public.zoom_job_attempt (run_id, created_at desc);
create index zoom_job_attempt_run_fk_idx on public.zoom_job_attempt (zoom_job_run_id, created_at desc);
create index zoom_job_attempt_action_idx on public.zoom_job_attempt (action_type, created_at desc);
create index zoom_job_attempt_class_idx on public.zoom_job_attempt (class_id, created_at desc);
create index zoom_job_attempt_profile_idx on public.zoom_job_attempt (profile_id, created_at desc);
create index zoom_job_attempt_meeting_idx on public.zoom_job_attempt (class_zoom_meeting_id, created_at desc);
create index zoom_job_attempt_event_attempt_idx on public.zoom_job_attempt_event (zoom_job_attempt_id, created_at desc);

create or replace function public.touch_zoom_job_run_updated_at()
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

create or replace function public.touch_zoom_job_attempt_updated_at()
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

create trigger on_zoom_job_run_updated_set_timestamp
before update on public.zoom_job_run
for each row execute function public.touch_zoom_job_run_updated_at();

create trigger on_zoom_job_attempt_updated_set_timestamp
before update on public.zoom_job_attempt
for each row execute function public.touch_zoom_job_attempt_updated_at();

alter table public.zoom_job_run enable row level security;
alter table public.zoom_job_attempt enable row level security;
alter table public.zoom_job_attempt_event enable row level security;

create policy zoom_job_run_select on public.zoom_job_run
  for select
  using (public.authorize('workshop.read'));

create policy zoom_job_run_insert on public.zoom_job_run
  for insert
  with check (public.authorize('workshop.update'));

create policy zoom_job_run_update on public.zoom_job_run
  for update
  using (public.authorize('workshop.update'))
  with check (public.authorize('workshop.update'));

create policy zoom_job_run_delete on public.zoom_job_run
  for delete
  using (public.authorize('workshop.delete'));

create policy zoom_job_attempt_select on public.zoom_job_attempt
  for select
  using (public.authorize('workshop.read'));

create policy zoom_job_attempt_insert on public.zoom_job_attempt
  for insert
  with check (public.authorize('workshop.update'));

create policy zoom_job_attempt_update on public.zoom_job_attempt
  for update
  using (public.authorize('workshop.update'))
  with check (public.authorize('workshop.update'));

create policy zoom_job_attempt_delete on public.zoom_job_attempt
  for delete
  using (public.authorize('workshop.delete'));

create policy zoom_job_attempt_event_select on public.zoom_job_attempt_event
  for select
  using (public.authorize('workshop.read'));

create policy zoom_job_attempt_event_insert on public.zoom_job_attempt_event
  for insert
  with check (public.authorize('workshop.update'));

create policy zoom_job_attempt_event_update on public.zoom_job_attempt_event
  for update
  using (public.authorize('workshop.update'))
  with check (public.authorize('workshop.update'));

create policy zoom_job_attempt_event_delete on public.zoom_job_attempt_event
  for delete
  using (public.authorize('workshop.delete'));

create policy zoom_job_run_auth_admin on public.zoom_job_run
  for all to supabase_auth_admin
  using (true)
  with check (true);

create policy zoom_job_attempt_auth_admin on public.zoom_job_attempt
  for all to supabase_auth_admin
  using (true)
  with check (true);

create policy zoom_job_attempt_event_auth_admin on public.zoom_job_attempt_event
  for all to supabase_auth_admin
  using (true)
  with check (true);

grant all on table public.zoom_job_run to supabase_auth_admin;
grant all on table public.zoom_job_attempt to supabase_auth_admin;
grant all on table public.zoom_job_attempt_event to supabase_auth_admin;

revoke all on table public.zoom_job_run from authenticated, anon, public;
revoke all on table public.zoom_job_attempt from authenticated, anon, public;
revoke all on table public.zoom_job_attempt_event from authenticated, anon, public;

grant select, insert, update, delete on table public.zoom_job_run to authenticated;
grant select, insert, update, delete on table public.zoom_job_attempt to authenticated;
grant select, insert, update, delete on table public.zoom_job_attempt_event to authenticated;
