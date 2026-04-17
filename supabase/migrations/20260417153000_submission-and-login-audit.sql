alter table public.form_submission
  drop constraint if exists form_submission_form_id_profile_id_key;

alter table public.form_submission
  add column if not exists user_id uuid references auth.users (id) on delete set null,
  add column if not exists ip_address inet,
  add column if not exists forwarded_for text,
  add column if not exists user_agent text,
  add column if not exists accept_language text,
  add column if not exists referer text,
  add column if not exists origin text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists form_submission_profile_form_submitted_idx
  on public.form_submission (profile_id, form_id, submitted_at desc);

create index if not exists form_submission_user_submitted_idx
  on public.form_submission (user_id, submitted_at desc);

drop policy if exists form_submission_assignee_insert on public.form_submission;

create policy form_submission_assignee_insert
  on public.form_submission
  for insert
  with check (
    (user_id is null or user_id = auth.uid())
    and profile_id in (
      select p.id from public.profile p where p.user_id = auth.uid()
    )
    and exists (
      select 1 from public.form_assignment fa
      where fa.form_id = form_submission.form_id
        and fa.user_id = auth.uid()
    )
  );

create table if not exists public.login_event (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  email text,
  login_method text not null,
  success boolean not null default true,
  ip_address inet,
  forwarded_for text,
  user_agent text,
  accept_language text,
  referer text,
  origin text,
  metadata jsonb not null default '{}'::jsonb,
  event_at timestamptz not null default now()
);

create index if not exists login_event_event_at_idx on public.login_event (event_at desc);
create index if not exists login_event_user_event_at_idx on public.login_event (user_id, event_at desc);
create index if not exists login_event_ip_address_idx on public.login_event (ip_address);

alter table public.login_event enable row level security;

drop policy if exists login_event_read_authorized on public.login_event;
create policy login_event_read_authorized
  on public.login_event
  for select
  using (public.authorize('profiles.read'));

drop policy if exists login_event_insert_self on public.login_event;
create policy login_event_insert_self
  on public.login_event
  for insert
  with check (user_id = auth.uid());

drop policy if exists login_event_read_auth_admin on public.login_event;
create policy login_event_read_auth_admin
  on public.login_event
  for select
  to supabase_auth_admin
  using (true);

grant all on table public.login_event to supabase_auth_admin;
revoke all on table public.login_event from authenticated, anon, public;
grant select, insert on table public.login_event to authenticated;
