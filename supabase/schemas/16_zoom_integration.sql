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

create index class_zoom_meeting_host_idx on public.class_zoom_meeting (zoom_host_id, start_time);
create index class_zoom_meeting_status_idx on public.class_zoom_meeting (status, start_time);
create index class_zoom_registrant_class_idx on public.class_zoom_registrant (class_id, profile_id);
create index class_zoom_participant_class_idx on public.class_zoom_participant (class_id, profile_id);
create index class_zoom_participant_email_idx on public.class_zoom_participant (lower(user_email));
create index class_zoom_participant_sync_meeting_idx on public.class_zoom_participant_sync (class_zoom_meeting_id, created_at desc);
create index zlr_click_event_registrant_idx on public.zlr_click_event (class_zoom_registrant_id, clicked_at desc);

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

grant usage on type public.zoom_meeting_status to authenticated, supabase_auth_admin;
grant usage on type public.zoom_sync_status to authenticated, supabase_auth_admin;

grant all on table public.zoom_host to supabase_auth_admin;
grant all on table public.class_zoom_meeting to supabase_auth_admin;
grant all on table public.class_zoom_registrant to supabase_auth_admin;
grant all on table public.class_zoom_participant_sync to supabase_auth_admin;
grant all on table public.class_zoom_participant to supabase_auth_admin;
grant all on table public.zlr_click_event to supabase_auth_admin;

revoke all on table public.zoom_host from authenticated, anon, public;
revoke all on table public.class_zoom_meeting from authenticated, anon, public;
revoke all on table public.class_zoom_registrant from authenticated, anon, public;
revoke all on table public.class_zoom_participant_sync from authenticated, anon, public;
revoke all on table public.class_zoom_participant from authenticated, anon, public;
revoke all on table public.zlr_click_event from authenticated, anon, public;

grant select, insert, update, delete on table public.zoom_host to authenticated;
grant select, insert, update, delete on table public.class_zoom_meeting to authenticated;
grant select, insert, update, delete on table public.class_zoom_registrant to authenticated;
grant select, insert, update, delete on table public.class_zoom_participant_sync to authenticated;
grant select, insert, update, delete on table public.class_zoom_participant to authenticated;
grant select, insert, update, delete on table public.zlr_click_event to authenticated;

grant execute on function public.zoom_try_advisory_lock(text) to supabase_auth_admin, service_role;
grant execute on function public.zoom_advisory_unlock(text) to supabase_auth_admin, service_role;
