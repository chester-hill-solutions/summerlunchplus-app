do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'semester_survey_kind'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.semester_survey_kind as enum ('pre_survey', 'post_survey');
  end if;
end;
$$;

create table if not exists public.semester_form_requirement (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semester(id) on delete cascade,
  form_id uuid not null references public.form(id) on delete restrict,
  kind public.semester_survey_kind not null,
  is_required boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (semester_id, form_id, kind)
);

create unique index if not exists semester_form_requirement_unique_active_kind
  on public.semester_form_requirement (semester_id, kind)
  where is_active = true;

create index if not exists semester_form_requirement_kind_idx
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

insert into public.semester_form_requirement (semester_id, form_id, kind, is_required, is_active)
select s.id, f.id, 'pre_survey'::public.semester_survey_kind, true, true
from public.form f
join public.semester s on f.name = 'Pre-Semester Survey - ' || s.id::text
on conflict (semester_id, form_id, kind) do nothing;

insert into public.semester_form_requirement (semester_id, form_id, kind, is_required, is_active)
select s.id, f.id, 'post_survey'::public.semester_survey_kind, true, true
from public.form f
join public.semester s on f.name = 'Post-Semester Survey - ' || s.id::text
on conflict (semester_id, form_id, kind) do nothing;

alter table public.semester_form_requirement enable row level security;

drop policy if exists semester_form_requirement_select_authorized on public.semester_form_requirement;
create policy semester_form_requirement_select_authorized
  on public.semester_form_requirement
  for select
  using (public.authorize('form.read'));

drop policy if exists semester_form_requirement_insert_authorized on public.semester_form_requirement;
create policy semester_form_requirement_insert_authorized
  on public.semester_form_requirement
  for insert
  with check (public.authorize('form.update'));

drop policy if exists semester_form_requirement_update_authorized on public.semester_form_requirement;
create policy semester_form_requirement_update_authorized
  on public.semester_form_requirement
  for update
  using (public.authorize('form.update'))
  with check (public.authorize('form.update'));

drop policy if exists semester_form_requirement_delete_authorized on public.semester_form_requirement;
create policy semester_form_requirement_delete_authorized
  on public.semester_form_requirement
  for delete
  using (public.authorize('form.delete'));

drop policy if exists semester_form_requirement_read_auth_admin on public.semester_form_requirement;
create policy semester_form_requirement_read_auth_admin
  on public.semester_form_requirement
  for select
  to supabase_auth_admin
  using (true);

drop policy if exists semester_form_requirement_insert_auth_admin on public.semester_form_requirement;
create policy semester_form_requirement_insert_auth_admin
  on public.semester_form_requirement
  for insert
  to supabase_auth_admin
  with check (true);

drop policy if exists semester_form_requirement_update_auth_admin on public.semester_form_requirement;
create policy semester_form_requirement_update_auth_admin
  on public.semester_form_requirement
  for update
  to supabase_auth_admin
  using (true)
  with check (true);

drop policy if exists semester_form_requirement_delete_auth_admin on public.semester_form_requirement;
create policy semester_form_requirement_delete_auth_admin
  on public.semester_form_requirement
  for delete
  to supabase_auth_admin
  using (true);

grant all on table public.semester_form_requirement to supabase_auth_admin;

revoke all on table public.semester_form_requirement from authenticated, anon, public;
grant all on table public.semester_form_requirement to authenticated;

grant usage on type public.semester_survey_kind to authenticated, supabase_auth_admin;
