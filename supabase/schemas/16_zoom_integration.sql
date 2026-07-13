create type public.zoom_meeting_status as enum (
  'pending',
  'created',
  'failed',
  'cancelled'
);

create type public.zoom_sync_status as enum (
  'pending',
  'running',
  'completed',
  'failed'
);

create table public.zoom_host (
  id uuid primary key default gen_random_uuid(),
  zoom_user_id text unique,
  zoom_user_email text unique,
  display_name text,
  is_active boolean not null default true,
  priority integer not null default 100,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    coalesce(nullif(btrim(zoom_user_id), ''), nullif(btrim(zoom_user_email), '')) is not null
  )
);

create table public.class_zoom_meeting (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.class (id) on update cascade on delete cascade,
  zoom_host_id uuid not null references public.zoom_host (id) on update cascade on delete restrict,
  zoom_meeting_id text unique,
  zoom_meeting_uuid text unique,
  host_zoom_user_id text,
  host_zoom_user_email text,
  topic text,
  start_time timestamptz,
  duration_minutes integer,
  join_url text,
  status public.zoom_meeting_status not null default 'pending',
  error_message text,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_id),
  check (
    coalesce(nullif(btrim(host_zoom_user_id), ''), nullif(btrim(host_zoom_user_email), '')) is not null
  )
);

create table public.class_zoom_registrant (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.class (id) on update cascade on delete cascade,
  profile_id uuid not null references public.profile (id) on update cascade on delete cascade,
  class_zoom_meeting_id uuid not null references public.class_zoom_meeting (id) on update cascade on delete cascade,
  zoom_registrant_id text,
  zoom_join_url text,
  zlr_token_hash text not null unique,
  zlr_expires_at timestamptz,
  last_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_id, profile_id)
);

create table public.class_zoom_participant_sync (
  id uuid primary key default gen_random_uuid(),
  class_zoom_meeting_id uuid not null references public.class_zoom_meeting (id) on update cascade on delete cascade,
  status public.zoom_sync_status not null default 'pending',
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.class_zoom_participant (
  id uuid primary key default gen_random_uuid(),
  class_zoom_meeting_id uuid not null references public.class_zoom_meeting (id) on update cascade on delete cascade,
  class_id uuid not null references public.class (id) on update cascade on delete cascade,
  profile_id uuid references public.profile (id) on update cascade on delete set null,
  zoom_user_id text,
  user_name text,
  user_email text,
  join_time timestamptz,
  leave_time timestamptz,
  duration_seconds integer,
  camera_on boolean,
  attentiveness_score numeric,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.zlr_click_event (
  id uuid primary key default gen_random_uuid(),
  class_zoom_registrant_id uuid not null references public.class_zoom_registrant (id) on update cascade on delete cascade,
  profile_id uuid references public.profile (id) on update cascade on delete set null,
  clicked_at timestamptz not null default now(),
  ip_address inet,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb
);

create table public.zoom_job_lock (
  lock_name text primary key,
  owner_run_id text not null,
  owner_kind text not null,
  owner_instance text,
  metadata jsonb not null default '{}'::jsonb,
  acquired_at timestamptz not null default timezone('utc', now()),
  last_heartbeat_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null
);

create index class_zoom_meeting_host_idx on public.class_zoom_meeting (zoom_host_id, start_time);
create index class_zoom_meeting_status_idx on public.class_zoom_meeting (status, start_time);
create index class_zoom_registrant_class_idx on public.class_zoom_registrant (class_id, profile_id);
create index class_zoom_participant_class_idx on public.class_zoom_participant (class_id, profile_id);
create index class_zoom_participant_email_idx on public.class_zoom_participant (lower(user_email));
create index class_zoom_participant_sync_meeting_idx on public.class_zoom_participant_sync (class_zoom_meeting_id, created_at desc);
create index zlr_click_event_registrant_idx on public.zlr_click_event (class_zoom_registrant_id, clicked_at desc);
create index zoom_job_lock_expires_idx on public.zoom_job_lock (expires_at);

create or replace function public.touch_zoom_host_updated_at()
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

create or replace function public.touch_class_zoom_meeting_updated_at()
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

create or replace function public.touch_class_zoom_registrant_updated_at()
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

drop trigger if exists on_zoom_host_updated_set_timestamp on public.zoom_host;
create trigger on_zoom_host_updated_set_timestamp
before update on public.zoom_host
for each row execute function public.touch_zoom_host_updated_at();

drop trigger if exists on_class_zoom_meeting_updated_set_timestamp on public.class_zoom_meeting;
create trigger on_class_zoom_meeting_updated_set_timestamp
before update on public.class_zoom_meeting
for each row execute function public.touch_class_zoom_meeting_updated_at();

drop trigger if exists on_class_zoom_registrant_updated_set_timestamp on public.class_zoom_registrant;
create trigger on_class_zoom_registrant_updated_set_timestamp
before update on public.class_zoom_registrant
for each row execute function public.touch_class_zoom_registrant_updated_at();

alter table public.zoom_host enable row level security;
alter table public.class_zoom_meeting enable row level security;
alter table public.class_zoom_registrant enable row level security;
alter table public.class_zoom_participant_sync enable row level security;
alter table public.class_zoom_participant enable row level security;
alter table public.zlr_click_event enable row level security;

create policy zoom_host_select on public.zoom_host
  for select
  using (public.authorize('workshop.read'));

create policy zoom_host_insert on public.zoom_host
  for insert
  with check (public.authorize('workshop.create'));

create policy zoom_host_update on public.zoom_host
  for update
  using (public.authorize('workshop.update'))
  with check (public.authorize('workshop.update'));

create policy zoom_host_delete on public.zoom_host
  for delete
  using (public.authorize('workshop.delete'));

create policy class_zoom_meeting_select on public.class_zoom_meeting
  for select
  using (public.authorize('workshop.read'));

create policy class_zoom_meeting_insert on public.class_zoom_meeting
  for insert
  with check (public.authorize('workshop.create'));

create policy class_zoom_meeting_update on public.class_zoom_meeting
  for update
  using (public.authorize('workshop.update'))
  with check (public.authorize('workshop.update'));

create policy class_zoom_meeting_delete on public.class_zoom_meeting
  for delete
  using (public.authorize('workshop.delete'));

create policy class_zoom_registrant_select on public.class_zoom_registrant
  for select
  using (public.authorize('workshop.read'));

create policy class_zoom_registrant_insert on public.class_zoom_registrant
  for insert
  with check (public.authorize('workshop.update'));

create policy class_zoom_registrant_update on public.class_zoom_registrant
  for update
  using (public.authorize('workshop.update'))
  with check (public.authorize('workshop.update'));

create policy class_zoom_registrant_delete on public.class_zoom_registrant
  for delete
  using (public.authorize('workshop.delete'));

create policy class_zoom_participant_sync_select on public.class_zoom_participant_sync
  for select
  using (public.authorize('workshop.read'));

create policy class_zoom_participant_sync_insert on public.class_zoom_participant_sync
  for insert
  with check (public.authorize('workshop.update'));

create policy class_zoom_participant_sync_update on public.class_zoom_participant_sync
  for update
  using (public.authorize('workshop.update'))
  with check (public.authorize('workshop.update'));

create policy class_zoom_participant_sync_delete on public.class_zoom_participant_sync
  for delete
  using (public.authorize('workshop.delete'));

create policy class_zoom_participant_select on public.class_zoom_participant
  for select
  using (public.authorize('class_attendance.read'));

create policy class_zoom_participant_insert on public.class_zoom_participant
  for insert
  with check (public.authorize('class_attendance.update'));

create policy class_zoom_participant_update on public.class_zoom_participant
  for update
  using (public.authorize('class_attendance.update'))
  with check (public.authorize('class_attendance.update'));

create policy class_zoom_participant_delete on public.class_zoom_participant
  for delete
  using (public.authorize('class_attendance.delete'));

create policy zlr_click_event_select on public.zlr_click_event
  for select
  using (public.authorize('class_attendance.read'));

create policy zlr_click_event_insert on public.zlr_click_event
  for insert
  with check (public.authorize('class_attendance.update'));

create policy zlr_click_event_update on public.zlr_click_event
  for update
  using (public.authorize('class_attendance.update'))
  with check (public.authorize('class_attendance.update'));

create policy zlr_click_event_delete on public.zlr_click_event
  for delete
  using (public.authorize('class_attendance.delete'));

create policy zoom_host_auth_admin on public.zoom_host
  for all to supabase_auth_admin
  using (true)
  with check (true);

create policy class_zoom_meeting_auth_admin on public.class_zoom_meeting
  for all to supabase_auth_admin
  using (true)
  with check (true);

create policy class_zoom_registrant_auth_admin on public.class_zoom_registrant
  for all to supabase_auth_admin
  using (true)
  with check (true);

create policy class_zoom_participant_sync_auth_admin on public.class_zoom_participant_sync
  for all to supabase_auth_admin
  using (true)
  with check (true);

create policy class_zoom_participant_auth_admin on public.class_zoom_participant
  for all to supabase_auth_admin
  using (true)
  with check (true);

create policy zlr_click_event_auth_admin on public.zlr_click_event
  for all to supabase_auth_admin
  using (true)
  with check (true);

create or replace function public.zoom_try_advisory_lock(p_lock_name text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select pg_try_advisory_lock(hashtextextended(coalesce(nullif(btrim(p_lock_name), ''), 'zoom:default'), 0));
$$;

create or replace function public.zoom_advisory_unlock(p_lock_name text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select pg_advisory_unlock(hashtextextended(coalesce(nullif(btrim(p_lock_name), ''), 'zoom:default'), 0));
$$;

create or replace function public.zoom_lock_try_acquire(
  p_lock_name text,
  p_owner_run_id text,
  p_owner_kind text,
  p_ttl_seconds integer default 120,
  p_metadata jsonb default '{}'::jsonb,
  p_owner_instance text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_lock_name text := coalesce(nullif(btrim(p_lock_name), ''), 'zoom:default');
  v_owner_run_id text := coalesce(nullif(btrim(p_owner_run_id), ''), 'unknown-run');
  v_owner_kind text := coalesce(nullif(btrim(p_owner_kind), ''), 'unknown-kind');
  v_expires_at timestamptz := v_now + make_interval(secs => greatest(coalesce(p_ttl_seconds, 120), 15));
  v_existing public.zoom_job_lock%rowtype;
begin
  delete from public.zoom_job_lock
  where lock_name = v_lock_name
    and expires_at <= v_now;

  insert into public.zoom_job_lock (
    lock_name,
    owner_run_id,
    owner_kind,
    owner_instance,
    metadata,
    acquired_at,
    last_heartbeat_at,
    expires_at
  )
  values (
    v_lock_name,
    v_owner_run_id,
    v_owner_kind,
    p_owner_instance,
    coalesce(p_metadata, '{}'::jsonb),
    v_now,
    v_now,
    v_expires_at
  )
  on conflict (lock_name) do nothing;

  if found then
    return jsonb_build_object(
      'acquired', true,
      'lock_name', v_lock_name,
      'owner_run_id', v_owner_run_id,
      'owner_kind', v_owner_kind,
      'expires_at', v_expires_at,
      'ttl_remaining_ms', greatest(0, floor(extract(epoch from (v_expires_at - v_now)) * 1000))::bigint
    );
  end if;

  select *
    into v_existing
  from public.zoom_job_lock
  where lock_name = v_lock_name;

  return jsonb_build_object(
    'acquired', false,
    'lock_name', v_lock_name,
    'blocked_by_owner_run_id', v_existing.owner_run_id,
    'blocked_by_owner_kind', v_existing.owner_kind,
    'blocked_by_owner_instance', v_existing.owner_instance,
    'blocked_expires_at', v_existing.expires_at,
    'ttl_remaining_ms', greatest(0, floor(extract(epoch from (v_existing.expires_at - v_now)) * 1000))::bigint,
    'metadata', coalesce(v_existing.metadata, '{}'::jsonb)
  );
end;
$$;

create or replace function public.zoom_lock_heartbeat(
  p_lock_name text,
  p_owner_run_id text,
  p_ttl_seconds integer default 120
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_lock_name text := coalesce(nullif(btrim(p_lock_name), ''), 'zoom:default');
  v_owner_run_id text := coalesce(nullif(btrim(p_owner_run_id), ''), 'unknown-run');
  v_expires_at timestamptz := v_now + make_interval(secs => greatest(coalesce(p_ttl_seconds, 120), 15));
begin
  update public.zoom_job_lock
  set
    last_heartbeat_at = v_now,
    expires_at = v_expires_at
  where lock_name = v_lock_name
    and owner_run_id = v_owner_run_id
    and expires_at > v_now;

  return found;
end;
$$;

create or replace function public.zoom_lock_release(
  p_lock_name text,
  p_owner_run_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lock_name text := coalesce(nullif(btrim(p_lock_name), ''), 'zoom:default');
  v_owner_run_id text := coalesce(nullif(btrim(p_owner_run_id), ''), 'unknown-run');
begin
  delete from public.zoom_job_lock
  where lock_name = v_lock_name
    and owner_run_id = v_owner_run_id;

  return found;
end;
$$;

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

drop trigger if exists on_zoom_job_run_updated_set_timestamp on public.zoom_job_run;
create trigger on_zoom_job_run_updated_set_timestamp
before update on public.zoom_job_run
for each row execute function public.touch_zoom_job_run_updated_at();

drop trigger if exists on_zoom_job_attempt_updated_set_timestamp on public.zoom_job_attempt;
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

grant usage on type public.zoom_meeting_status to authenticated, supabase_auth_admin;
grant usage on type public.zoom_sync_status to authenticated, supabase_auth_admin;

grant all on table public.zoom_host to supabase_auth_admin;
grant all on table public.class_zoom_meeting to supabase_auth_admin;
grant all on table public.class_zoom_registrant to supabase_auth_admin;
grant all on table public.class_zoom_participant_sync to supabase_auth_admin;
grant all on table public.class_zoom_participant to supabase_auth_admin;
grant all on table public.zlr_click_event to supabase_auth_admin;
grant all on table public.zoom_job_lock to supabase_auth_admin;
grant all on table public.zoom_job_run to supabase_auth_admin;
grant all on table public.zoom_job_attempt to supabase_auth_admin;
grant all on table public.zoom_job_attempt_event to supabase_auth_admin;

revoke all on table public.zoom_host from authenticated, anon, public;
revoke all on table public.class_zoom_meeting from authenticated, anon, public;
revoke all on table public.class_zoom_registrant from authenticated, anon, public;
revoke all on table public.class_zoom_participant_sync from authenticated, anon, public;
revoke all on table public.class_zoom_participant from authenticated, anon, public;
revoke all on table public.zlr_click_event from authenticated, anon, public;
revoke all on table public.zoom_job_lock from authenticated, anon, public;
revoke all on table public.zoom_job_run from authenticated, anon, public;
revoke all on table public.zoom_job_attempt from authenticated, anon, public;
revoke all on table public.zoom_job_attempt_event from authenticated, anon, public;

grant select, insert, update, delete on table public.zoom_host to authenticated;
grant select, insert, update, delete on table public.class_zoom_meeting to authenticated;
grant select, insert, update, delete on table public.class_zoom_registrant to authenticated;
grant select, insert, update, delete on table public.class_zoom_participant_sync to authenticated;
grant select, insert, update, delete on table public.class_zoom_participant to authenticated;
grant select, insert, update, delete on table public.zlr_click_event to authenticated;
grant select, insert, update, delete on table public.zoom_job_run to authenticated;
grant select, insert, update, delete on table public.zoom_job_attempt to authenticated;
grant select, insert, update, delete on table public.zoom_job_attempt_event to authenticated;

grant execute on function public.zoom_try_advisory_lock(text) to supabase_auth_admin, service_role;
grant execute on function public.zoom_advisory_unlock(text) to supabase_auth_admin, service_role;
grant execute on function public.zoom_lock_try_acquire(text, text, text, integer, jsonb, text) to supabase_auth_admin, service_role;
grant execute on function public.zoom_lock_heartbeat(text, text, integer) to supabase_auth_admin, service_role;
grant execute on function public.zoom_lock_release(text, text) to supabase_auth_admin, service_role;
