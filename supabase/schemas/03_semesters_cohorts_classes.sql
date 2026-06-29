-- Workshop groups and classes for the summer program.

create type public.workshop_enrollment_status as enum (
  'pending',
  'waitlisted',
  'approved',
  'rejected',
  'revoked'
);

create type public.class_attendance_status as enum (
  'unknown',
  'present',
  'absent'
);

create type public.class_attendance_photo_status as enum (
  'uploaded',
  'accepted',
  'rejected'
);

create table public.semester (
  id uuid primary key default gen_random_uuid(),
  name text,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  enrollment_open_at timestamptz,
  enrollment_close_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (starts_at < ends_at),
  check (
    enrollment_open_at is null
    or enrollment_close_at is null
    or enrollment_open_at < enrollment_close_at
  )
);

create table public.workshop (
  id uuid primary key default gen_random_uuid(),
  semester_id uuid not null references public.semester (id) on update cascade on delete restrict,
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
  workshop_id uuid references public.workshop (id) on update cascade on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (starts_at < ends_at)
);

create table public.class_attendance (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.class (id) on update cascade on delete cascade,
  profile_id uuid not null references public.profile (id) on update cascade on delete cascade,
  status public.class_attendance_status,
  photo_status public.class_attendance_photo_status,
  camera_on boolean,
  recorded_by uuid references auth.users (id) on update cascade on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_id, profile_id)
);

create table public.workshop_enrollment (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid references public.workshop (id) on update cascade on delete set null,
  semester_id uuid not null references public.semester (id) on update cascade on delete restrict,
  profile_id uuid references public.profile (id) on update cascade on delete set null,
    status public.workshop_enrollment_status not null default 'pending',
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users (id) on update cascade on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (semester_id, profile_id)
);

-- Timestamp helpers.
create or replace function public.touch_workshop_updated_at()
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

drop trigger if exists on_workshop_updated_set_timestamp on public.workshop;
create trigger on_workshop_updated_set_timestamp
before update on public.workshop
for each row execute function public.touch_workshop_updated_at();

drop trigger if exists on_semester_updated_set_timestamp on public.semester;
create trigger on_semester_updated_set_timestamp
before update on public.semester
for each row execute function public.touch_semester_updated_at();

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

create or replace function public.touch_class_attendance_updated_at()
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


create or replace function public.touch_workshop_enrollment_updated_at()
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

create or replace function public.set_workshop_enrollment_semester_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.workshop_id is not null then
    select semester_id into new.semester_id
    from public.workshop
    where id = new.workshop_id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_workshop_enrollment_updated_set_timestamp on public.workshop_enrollment;
create trigger on_workshop_enrollment_updated_set_timestamp
before update on public.workshop_enrollment
for each row execute function public.touch_workshop_enrollment_updated_at();

drop trigger if exists on_class_attendance_updated_set_timestamp on public.class_attendance;
create trigger on_class_attendance_updated_set_timestamp
before update on public.class_attendance
for each row execute function public.touch_class_attendance_updated_at();

drop trigger if exists on_workshop_enrollment_set_semester_id on public.workshop_enrollment;
create trigger on_workshop_enrollment_set_semester_id
before insert or update of workshop_id on public.workshop_enrollment
for each row execute function public.set_workshop_enrollment_semester_id();

create or replace function public.set_workshop_enrollment_decision_fields()
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

create or replace function public.request_family_workshop_enrollment(
  p_workshop_id uuid,
  p_profile_id uuid,
  p_family_profile_ids uuid[]
)
returns table (
  ok boolean,
  enrollment_id uuid,
  enrollment_status public.workshop_enrollment_status,
  error_code text,
  error_message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workshop public.workshop%rowtype;
  v_now timestamptz := now();
  v_existing_enrollment_id uuid;
  v_reusable_enrollment_id uuid;
  v_approved_count integer;
  v_waitlisted_count integer;
  v_status public.workshop_enrollment_status;
  v_inserted_id uuid;
begin
  if p_workshop_id is null or p_profile_id is null then
    return query select false, null::uuid, null::public.workshop_enrollment_status, 'invalid_input', 'Missing workshop or profile id';
    return;
  end if;

  select *
  into v_workshop
  from public.workshop
  where id = p_workshop_id
  for update;

  if not found then
    return query select false, null::uuid, null::public.workshop_enrollment_status, 'workshop_not_found', 'Workshop not found';
    return;
  end if;

  if (
    (v_workshop.enrollment_open_at is not null and v_now < v_workshop.enrollment_open_at)
    or (v_workshop.enrollment_close_at is not null and v_now > v_workshop.enrollment_close_at)
  ) then
    return query select false, null::uuid, null::public.workshop_enrollment_status, 'enrollment_closed', 'Enrollment is closed for this workshop';
    return;
  end if;

  select we.id
  into v_existing_enrollment_id
  from public.workshop_enrollment we
  where we.semester_id = v_workshop.semester_id
    and we.profile_id = any(coalesce(p_family_profile_ids, array[]::uuid[]))
    and we.status not in ('rejected', 'revoked')
  limit 1;

  if v_existing_enrollment_id is not null then
    return query select false, null::uuid, null::public.workshop_enrollment_status, 'family_already_enrolled', 'Your family is already enrolled in one workshop for this semester.';
    return;
  end if;

  select we.id
  into v_reusable_enrollment_id
  from public.workshop_enrollment we
  where we.semester_id = v_workshop.semester_id
    and we.profile_id = p_profile_id
    and we.status in ('rejected', 'revoked')
  order by we.updated_at desc, we.requested_at desc
  limit 1
  for update;

  select count(*)::integer
  into v_approved_count
  from public.workshop_enrollment
  where workshop_id = p_workshop_id
    and status = 'approved';

  select count(*)::integer
  into v_waitlisted_count
  from public.workshop_enrollment
  where workshop_id = p_workshop_id
    and status = 'waitlisted';

  if v_approved_count < greatest(coalesce(v_workshop.capacity, 0), 0) then
    v_status := 'pending';
  elsif v_waitlisted_count < greatest(coalesce(v_workshop.wait_list_capacity, 0), 0) then
    v_status := 'waitlisted';
  else
    return query select false, null::uuid, null::public.workshop_enrollment_status, 'workshop_full', 'This workshop and its waitlist are full';
    return;
  end if;

  if v_reusable_enrollment_id is not null then
    update public.workshop_enrollment
    set
      workshop_id = p_workshop_id,
      status = v_status,
      requested_at = v_now,
      decided_at = null,
      decided_by = null
    where id = v_reusable_enrollment_id
    returning id into v_inserted_id;
  else
    insert into public.workshop_enrollment (workshop_id, profile_id, status)
    values (p_workshop_id, p_profile_id, v_status)
    returning id into v_inserted_id;
  end if;

  return query select true, v_inserted_id, v_status, null::text, null::text;
end;
$$;

drop trigger if exists on_workshop_enrollment_set_decision_fields on public.workshop_enrollment;
create trigger on_workshop_enrollment_set_decision_fields
before update on public.workshop_enrollment
for each row execute function public.set_workshop_enrollment_decision_fields();

create or replace function public.ensure_class_attendance_rows()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.class_attendance (class_id, profile_id, status)
  select c.id, we.profile_id, null
  from public.class c
  join public.workshop_enrollment we on we.workshop_id = c.workshop_id
  where c.ends_at < now()
    and we.status = 'approved'
  on conflict (class_id, profile_id) do nothing;
end;
$$;

create extension if not exists pg_cron with schema extensions;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'class_attendance_hourly') then
    perform cron.schedule(
      'class_attendance_hourly',
      '0 * * * *',
      $cron$select public.ensure_class_attendance_rows();$cron$
    );
  end if;
end $$;

-- RLS
alter table public.workshop enable row level security;
alter table public.semester enable row level security;
alter table public.class enable row level security;
alter table public.class_attendance enable row level security;
alter table public.workshop_enrollment enable row level security;

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

-- Workshop groups
create policy workshop_select_all
  on public.workshop
  for select
  using (true);

create policy workshop_insert_admin
  on public.workshop
  for insert
  with check (public.authorize('workshop.create'));

create policy workshop_update_admin
  on public.workshop
  for update
  using (public.authorize('workshop.update'))
  with check (public.authorize('workshop.update'));

create policy workshop_delete_admin
  on public.workshop
  for delete
  using (public.authorize('workshop.delete'));

create policy workshop_read_auth_admin
  on public.workshop
  for select
  to supabase_auth_admin
  using (true);

-- Classes
create policy class_select_all
  on public.class
  for select
  using (true);

create policy class_attendance_select_admin
  on public.class_attendance
  for select
  using (public.authorize('class_attendance.read'));

create policy class_attendance_insert_admin
  on public.class_attendance
  for insert
  with check (public.authorize('class_attendance.create'));

create policy class_attendance_update_admin
  on public.class_attendance
  for update
  using (public.authorize('class_attendance.update'))
  with check (public.authorize('class_attendance.update'));

create policy class_attendance_delete_admin
  on public.class_attendance
  for delete
  using (public.authorize('class_attendance.delete'));

create policy class_attendance_read_auth_admin
  on public.class_attendance
  for select
  to supabase_auth_admin
  using (true);

create policy class_insert_admin
  on public.class
  for insert
  with check (public.authorize('workshop.create'));

create policy class_update_admin
  on public.class
  for update
  using (public.authorize('workshop.update'))
  with check (public.authorize('workshop.update'));

create policy class_delete_admin
  on public.class
  for delete
  using (public.authorize('workshop.delete'));

create policy class_read_auth_admin
  on public.class
  for select
  to supabase_auth_admin
  using (true);

-- Workshop enrollments
create policy workshop_enrollment_select_admin
  on public.workshop_enrollment
  for select
  using (public.authorize('workshop_enrollment.read'));

create policy workshop_enrollment_select_self
  on public.workshop_enrollment
  for select
  using (
    profile_id in (
      select p.id from public.profile p where p.user_id = auth.uid()
    )
    or profile_id in (
      select pgc.child_profile_id
      from public.person_guardian_child pgc
      join public.profile p on p.id = pgc.guardian_profile_id
      where p.user_id = auth.uid()
    )
  );

create policy workshop_enrollment_insert_self
  on public.workshop_enrollment
  for insert
  with check (
    (
      profile_id in (
        select p.id from public.profile p where p.user_id = auth.uid()
      )
      or profile_id in (
        select pgc.child_profile_id
        from public.person_guardian_child pgc
        join public.profile p on p.id = pgc.guardian_profile_id
        where p.user_id = auth.uid()
      )
    )
    and coalesce(status::text, 'pending') in ('pending', 'waitlisted')
  );

create policy workshop_enrollment_update_admin
  on public.workshop_enrollment
  for update
  using (
    public.authorize('workshop_enrollment.update')
    or public.authorize('workshop_enrollment.update_status')
  )
  with check (
    public.authorize('workshop_enrollment.update')
    or public.authorize('workshop_enrollment.update_status')
  );

create policy workshop_enrollment_read_auth_admin
  on public.workshop_enrollment
  for select
  to supabase_auth_admin
  using (true);

-- Grants
grant usage on type public.workshop_enrollment_status to authenticated, supabase_auth_admin;
grant usage on type public.class_attendance_status to authenticated, supabase_auth_admin;
grant usage on type public.class_attendance_photo_status to authenticated, supabase_auth_admin;

grant all on table public.semester to supabase_auth_admin;

grant all on table public.workshop to supabase_auth_admin;
grant all on table public.class to supabase_auth_admin;
grant all on table public.class_attendance to supabase_auth_admin;
grant all on table public.workshop_enrollment to supabase_auth_admin;

revoke all on table public.semester from authenticated, anon, public;
revoke all on table public.workshop from authenticated, anon, public;
revoke all on table public.class from authenticated, anon, public;
revoke all on table public.class_attendance from authenticated, anon, public;
revoke all on table public.workshop_enrollment from authenticated, anon, public;

grant all on table public.semester to authenticated;
grant all on table public.workshop to authenticated;
grant all on table public.class to authenticated;
grant all on table public.class_attendance to authenticated;
grant all on table public.workshop_enrollment to authenticated;

revoke all on function public.request_family_workshop_enrollment(uuid, uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.request_family_workshop_enrollment(uuid, uuid, uuid[]) to service_role, supabase_auth_admin;
