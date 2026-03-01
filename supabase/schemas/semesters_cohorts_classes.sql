-- Class sections, classes, and enrollments.

create type public.class_section_enrollment_status as enum (
  'pending',
  'approved',
  'rejected'
);

create table public.class_section (
  id uuid primary key default gen_random_uuid(),
  description text,
  enrollment_open_at timestamptz,
  enrollment_close_at timestamptz,
  capacity integer not null default 0,
  wait_list_capacity integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    enrollment_open_at is null
    or enrollment_close_at is null
    or enrollment_open_at < enrollment_close_at
  ),
  check (capacity >= 0),
  check (wait_list_capacity >= 0)
);

create table public.class (
  id uuid primary key default gen_random_uuid(),
  class_section_id uuid references public.class_section (id) on update cascade on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (starts_at < ends_at)
);

create table public.class_section_enrollment (
  id uuid primary key default gen_random_uuid(),
  class_section_id uuid references public.class_section (id) on update cascade on delete set null,
  user_id uuid references auth.users (id) on update cascade on delete set null,
  status public.class_section_enrollment_status not null default 'pending',
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users (id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_section_id, user_id)
);

-- Timestamp helpers.
create or replace function public.touch_class_section_updated_at()
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

drop trigger if exists on_class_section_updated_set_timestamp on public.class_section;
create trigger on_class_section_updated_set_timestamp
before update on public.class_section
for each row execute function public.touch_class_section_updated_at();

create or replace function public.touch_class_updated_at()
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

drop trigger if exists on_class_updated_set_timestamp on public.class;
create trigger on_class_updated_set_timestamp
before update on public.class
for each row execute function public.touch_class_updated_at();

create or replace function public.touch_class_section_enrollment_updated_at()
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

drop trigger if exists on_class_section_enrollment_updated_set_timestamp on public.class_section_enrollment;
create trigger on_class_section_enrollment_updated_set_timestamp
before update on public.class_section_enrollment
for each row execute function public.touch_class_section_enrollment_updated_at();

create or replace function public.set_class_section_enrollment_decision_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status and new.status is distinct from 'pending' then
    new.decided_at := coalesce(new.decided_at, now());
    new.decided_by := coalesce(new.decided_by, auth.uid());
  end if;

  return new;
end;
$$;

drop trigger if exists on_class_section_enrollment_set_decision_fields on public.class_section_enrollment;
create trigger on_class_section_enrollment_set_decision_fields
before update on public.class_section_enrollment
for each row execute function public.set_class_section_enrollment_decision_fields();

-- RLS
alter table public.class_section enable row level security;
alter table public.class enable row level security;
alter table public.class_section_enrollment enable row level security;

-- Class sections
create policy class_section_select_all
  on public.class_section
  for select
  using (true);

create policy class_section_insert_admin
  on public.class_section
  for insert
  with check (public.authorize('class_section.create'));

create policy class_section_update_admin
  on public.class_section
  for update
  using (public.authorize('class_section.update'))
  with check (public.authorize('class_section.update'));

create policy class_section_delete_admin
  on public.class_section
  for delete
  using (public.authorize('class_section.delete'));

create policy class_section_read_auth_admin
  on public.class_section
  for select
  to supabase_auth_admin
  using (true);

-- Classes
create policy class_select_all
  on public.class
  for select
  using (true);

create policy class_insert_admin
  on public.class
  for insert
  with check (public.authorize('class.create'));

create policy class_update_admin
  on public.class
  for update
  using (public.authorize('class.update'))
  with check (public.authorize('class.update'));

create policy class_delete_admin
  on public.class
  for delete
  using (public.authorize('class.delete'));

create policy class_read_auth_admin
  on public.class
  for select
  to supabase_auth_admin
  using (true);

-- Class section enrollments
create policy class_section_enrollment_select_admin
  on public.class_section_enrollment
  for select
  using (public.authorize('class_section_enrollment.read'));

create policy class_section_enrollment_select_self
  on public.class_section_enrollment
  for select
  using (user_id = auth.uid());

create policy class_section_enrollment_insert_self
  on public.class_section_enrollment
  for insert
  with check (
    user_id = auth.uid()
    and coalesce(status, 'pending') = 'pending'
  );

create policy class_section_enrollment_update_admin
  on public.class_section_enrollment
  for update
  using (
    public.authorize('class_section_enrollment.update')
    or public.authorize('class_section_enrollment.update_status')
  )
  with check (
    public.authorize('class_section_enrollment.update')
    or public.authorize('class_section_enrollment.update_status')
  );

create policy class_section_enrollment_read_auth_admin
  on public.class_section_enrollment
  for select
  to supabase_auth_admin
  using (true);

-- Grants
grant usage on type public.class_section_enrollment_status to authenticated, supabase_auth_admin;

grant all on table public.class_section to supabase_auth_admin;
grant all on table public.class to supabase_auth_admin;
grant all on table public.class_section_enrollment to supabase_auth_admin;

revoke all on table public.class_section from authenticated, anon, public;
revoke all on table public.class from authenticated, anon, public;
revoke all on table public.class_section_enrollment from authenticated, anon, public;

grant all on table public.class_section to authenticated;
grant all on table public.class to authenticated;
grant all on table public.class_section_enrollment to authenticated;
