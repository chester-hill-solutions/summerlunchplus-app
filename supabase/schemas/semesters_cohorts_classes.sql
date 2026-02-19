-- Semesters, cohorts, classes, and cohort enrollments with approval flow.

create type cohort_enrollment_status as enum (
  'pending',
  'approved',
  'rejected'
);

create table public.semester (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  starts_month date not null,
  ends_month date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name),
  unique (starts_month, ends_month),
  check (starts_at < ends_at)
);

create table public.cohort (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid references public.semester (id) on update cascade on delete set null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (semester_id, name)
);

create table public.class (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid references public.cohort (id) on update cascade on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (starts_at < ends_at)
);

create table public.cohort_enrollment (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid references public.cohort (id) on update cascade on delete set null,
  user_id uuid references auth.users (id) on update cascade on delete set null,
  status cohort_enrollment_status not null default 'pending',
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users (id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cohort_id, user_id)
);

-- Timestamp helpers.
create or replace function public.touch_semester_updated_at()
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

drop trigger if exists on_semester_updated_set_timestamp on public.semester;
create trigger on_semester_updated_set_timestamp
before update on public.semester
for each row execute function public.touch_semester_updated_at();

create or replace function public.set_semester_months()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.starts_month := make_date(date_part('year', new.starts_at)::int, date_part('month', new.starts_at)::int, 1);
  new.ends_month := make_date(date_part('year', new.ends_at)::int, date_part('month', new.ends_at)::int, 1);
  return new;
end;
$$;

drop trigger if exists on_semester_set_months on public.semester;
create trigger on_semester_set_months
before insert or update on public.semester
for each row execute function public.set_semester_months();

create or replace function public.touch_cohort_updated_at()
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

drop trigger if exists on_cohort_updated_set_timestamp on public.cohort;
create trigger on_cohort_updated_set_timestamp
before update on public.cohort
for each row execute function public.touch_cohort_updated_at();

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

create or replace function public.touch_cohort_enrollment_updated_at()
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

drop trigger if exists on_cohort_enrollment_updated_set_timestamp on public.cohort_enrollment;
create trigger on_cohort_enrollment_updated_set_timestamp
before update on public.cohort_enrollment
for each row execute function public.touch_cohort_enrollment_updated_at();

create or replace function public.set_cohort_enrollment_decision_fields()
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

drop trigger if exists on_cohort_enrollment_set_decision_fields on public.cohort_enrollment;
create trigger on_cohort_enrollment_set_decision_fields
before update on public.cohort_enrollment
for each row execute function public.set_cohort_enrollment_decision_fields();

-- RLS
alter table public.semester enable row level security;
alter table public.cohort enable row level security;
alter table public.class enable row level security;
alter table public.cohort_enrollment enable row level security;

-- Semesters
create policy semester_select_all
  on public.semester
  for select
  using (true);

create policy semester_insert_admin
  on public.semester
  for insert
  with check (public.authorize('semester.create'));

create policy semester_update_admin
  on public.semester
  for update
  using (public.authorize('semester.update'))
  with check (public.authorize('semester.update'));

create policy semester_delete_admin
  on public.semester
  for delete
  using (public.authorize('semester.delete'));

create policy semester_read_auth_admin
  on public.semester
  for select
  to supabase_auth_admin
  using (true);

-- Cohorts
create policy cohort_select_all
  on public.cohort
  for select
  using (true);

create policy cohort_insert_admin
  on public.cohort
  for insert
  with check (public.authorize('cohort.create'));

create policy cohort_update_admin
  on public.cohort
  for update
  using (public.authorize('cohort.update'))
  with check (public.authorize('cohort.update'));

create policy cohort_delete_admin
  on public.cohort
  for delete
  using (public.authorize('cohort.delete'));

create policy cohort_read_auth_admin
  on public.cohort
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

-- Cohort enrollments
create policy cohort_enrollment_select_admin
  on public.cohort_enrollment
  for select
  using (public.authorize('cohort_enrollment.read'));

create policy cohort_enrollment_select_self
  on public.cohort_enrollment
  for select
  using (user_id = auth.uid());

create policy cohort_enrollment_insert_self
  on public.cohort_enrollment
  for insert
  with check (
    user_id = auth.uid()
    and coalesce(status, 'pending') = 'pending'
  );

create policy cohort_enrollment_update_admin
  on public.cohort_enrollment
  for update
  using (
    public.authorize('cohort_enrollment.update')
    or public.authorize('cohort_enrollment.update_status')
  )
  with check (
    public.authorize('cohort_enrollment.update')
    or public.authorize('cohort_enrollment.update_status')
  );

create policy cohort_enrollment_read_auth_admin
  on public.cohort_enrollment
  for select
  to supabase_auth_admin
  using (true);

-- Grants
grant usage on type cohort_enrollment_status to authenticated, supabase_auth_admin;

grant all on table public.semester to supabase_auth_admin;
grant all on table public.cohort to supabase_auth_admin;
grant all on table public.class to supabase_auth_admin;
grant all on table public.cohort_enrollment to supabase_auth_admin;

revoke all on table public.semester from authenticated, anon, public;
revoke all on table public.cohort from authenticated, anon, public;
revoke all on table public.class from authenticated, anon, public;
revoke all on table public.cohort_enrollment from authenticated, anon, public;

grant all on table public.semester to authenticated;
grant all on table public.cohort to authenticated;
grant all on table public.class to authenticated;
grant all on table public.cohort_enrollment to authenticated;
