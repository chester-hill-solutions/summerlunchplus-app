create type public.email_draft_channel as enum ('transactional', 'auth');

create type public.email_draft_status as enum ('draft', 'published', 'archived');

create table public.email_draft (
  id uuid primary key default gen_random_uuid(),
  draft_key text not null unique,
  title text not null,
  description text,
  trigger_summary text not null default '',
  trigger_event_key text,
  trigger_owner text,
  channel public.email_draft_channel not null,
  status public.email_draft_status not null default 'draft',
  is_system boolean not null default false,
  variables_schema jsonb not null default '{}'::jsonb,
  current_subject_markdown text not null default '',
  current_body_markdown text not null default '',
  published_version_id uuid,
  created_by_user_id uuid references auth.users (id) on delete set null,
  updated_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_draft_trigger_summary_length_check check (char_length(trigger_summary) <= 200),
  constraint email_draft_trigger_summary_required_for_transactional
    check (channel <> 'transactional' or char_length(btrim(trigger_summary)) > 0)
);

create table public.email_draft_version (
  id uuid primary key default gen_random_uuid(),
  email_draft_id uuid not null references public.email_draft (id) on delete cascade,
  version_number integer not null check (version_number > 0),
  subject_markdown text not null,
  body_markdown text not null,
  subject_rendered text not null,
  html_rendered text not null,
  text_rendered text not null,
  variables_schema jsonb not null default '{}'::jsonb,
  change_note text,
  created_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  published_by_user_id uuid references auth.users (id) on delete set null,
  unique (email_draft_id, version_number)
);

alter table public.email_draft
  add constraint email_draft_published_version_id_fkey
  foreign key (published_version_id) references public.email_draft_version (id) on delete set null;

create index email_draft_channel_status_idx on public.email_draft (channel, status);
create index email_draft_updated_at_idx on public.email_draft (updated_at desc);
create index email_draft_version_draft_created_idx on public.email_draft_version (email_draft_id, created_at desc);

create or replace function public.touch_email_draft_updated_at()
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

drop trigger if exists on_email_draft_updated_set_timestamp on public.email_draft;
create trigger on_email_draft_updated_set_timestamp
before update on public.email_draft
for each row execute function public.touch_email_draft_updated_at();

alter table public.email_draft enable row level security;
alter table public.email_draft_version enable row level security;

create policy email_draft_read
  on public.email_draft
  for select
  using (public.authorize('form.read'));

create policy email_draft_insert
  on public.email_draft
  for insert
  with check (public.authorize('form.update'));

create policy email_draft_update
  on public.email_draft
  for update
  using (public.authorize('form.update'))
  with check (public.authorize('form.update'));

create policy email_draft_delete
  on public.email_draft
  for delete
  using (public.authorize('form.update') and not is_system);

create policy email_draft_version_read
  on public.email_draft_version
  for select
  using (public.authorize('form.read'));

create policy email_draft_version_insert
  on public.email_draft_version
  for insert
  with check (public.authorize('form.update'));

grant usage on type public.email_draft_channel to authenticated, supabase_auth_admin;
grant usage on type public.email_draft_status to authenticated, supabase_auth_admin;

grant all on table public.email_draft to supabase_auth_admin;
revoke all on table public.email_draft from anon, public;
grant select, insert, update, delete on table public.email_draft to authenticated;

grant all on table public.email_draft_version to supabase_auth_admin;
revoke all on table public.email_draft_version from anon, public;
grant select, insert on table public.email_draft_version to authenticated;
