create type semester_survey_kind as enum (
  'pre_program_survey',
  'post_program_survey'
);

create table public.semester_form_requirement (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semester(id) on delete cascade,
  form_id uuid not null references public.form(id) on delete restrict,
  kind semester_survey_kind not null,
  is_required boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (semester_id, form_id, kind)
);

create unique index semester_form_requirement_unique_active_kind
  on public.semester_form_requirement (semester_id, kind)
  where is_active = true;

create index semester_form_requirement_kind_idx
  on public.semester_form_requirement (kind, semester_id);

create or replace function public.touch_semester_form_requirement_updated_at()
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

drop trigger if exists on_semester_form_requirement_updated_set_timestamp on public.semester_form_requirement;
create trigger on_semester_form_requirement_updated_set_timestamp
before update on public.semester_form_requirement
for each row execute function public.touch_semester_form_requirement_updated_at();

alter table public.semester_form_requirement enable row level security;

create policy semester_form_requirement_select_authorized
  on public.semester_form_requirement
  for select
  using (public.authorize('form.read'));

create policy semester_form_requirement_insert_authorized
  on public.semester_form_requirement
  for insert
  with check (public.authorize('form.update'));

create policy semester_form_requirement_update_authorized
  on public.semester_form_requirement
  for update
  using (public.authorize('form.update'))
  with check (public.authorize('form.update'));

create policy semester_form_requirement_delete_authorized
  on public.semester_form_requirement
  for delete
  using (public.authorize('form.delete'));

create policy semester_form_requirement_read_auth_admin
  on public.semester_form_requirement
  for select
  to supabase_auth_admin
  using (true);

create policy semester_form_requirement_insert_auth_admin
  on public.semester_form_requirement
  for insert
  to supabase_auth_admin
  with check (true);

create policy semester_form_requirement_update_auth_admin
  on public.semester_form_requirement
  for update
  to supabase_auth_admin
  using (true)
  with check (true);

create policy semester_form_requirement_delete_auth_admin
  on public.semester_form_requirement
  for delete
  to supabase_auth_admin
  using (true);

grant all on table public.semester_form_requirement to supabase_auth_admin;

revoke all on table public.semester_form_requirement from authenticated, anon, public;
grant all on table public.semester_form_requirement to authenticated;

grant usage on type semester_survey_kind to authenticated, supabase_auth_admin;
