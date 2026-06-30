do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'class_attendance_photo_upload_status'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.class_attendance_photo_upload_status as enum (
      'started',
      'succeeded',
      'failed'
    );
  end if;
end $$;

create table if not exists public.class_attendance_photo (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.class (id) on update cascade on delete cascade,
  profile_id uuid not null references public.profile (id) on update cascade on delete cascade,
  class_attendance_id uuid references public.class_attendance (id) on update cascade on delete set null,
  storage_bucket text not null,
  storage_path text not null,
  file_name text,
  mime_type text,
  byte_size bigint,
  uploaded_by uuid references auth.users (id) on update cascade on delete set null,
  uploaded_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(btrim(storage_bucket)) > 0),
  check (length(btrim(storage_path)) > 0)
);

create table if not exists public.class_attendance_photo_upload_attempt (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.class (id) on update cascade on delete cascade,
  profile_id uuid not null references public.profile (id) on update cascade on delete cascade,
  class_attendance_id uuid references public.class_attendance (id) on update cascade on delete set null,
  uploaded_by uuid references auth.users (id) on update cascade on delete set null,
  storage_bucket text,
  storage_path text,
  file_name text,
  mime_type text,
  byte_size bigint,
  status public.class_attendance_photo_upload_status not null default 'started',
  error_message text,
  request_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists class_attendance_photo_class_profile_idx
  on public.class_attendance_photo (class_id, profile_id, uploaded_at desc);

create index if not exists class_attendance_photo_upload_attempt_class_profile_idx
  on public.class_attendance_photo_upload_attempt (class_id, profile_id, created_at desc);

create or replace function public.touch_class_attendance_photo_updated_at()
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

create or replace function public.touch_class_attendance_photo_upload_attempt_updated_at()
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

drop trigger if exists on_class_attendance_photo_updated_set_timestamp on public.class_attendance_photo;
create trigger on_class_attendance_photo_updated_set_timestamp
before update on public.class_attendance_photo
for each row execute function public.touch_class_attendance_photo_updated_at();

drop trigger if exists on_class_attendance_photo_upload_attempt_updated_set_timestamp on public.class_attendance_photo_upload_attempt;
create trigger on_class_attendance_photo_upload_attempt_updated_set_timestamp
before update on public.class_attendance_photo_upload_attempt
for each row execute function public.touch_class_attendance_photo_upload_attempt_updated_at();

alter table public.class_attendance_photo enable row level security;
alter table public.class_attendance_photo_upload_attempt enable row level security;

drop policy if exists class_attendance_photo_select_admin on public.class_attendance_photo;
create policy class_attendance_photo_select_admin
  on public.class_attendance_photo
  for select
  using (public.authorize('class_attendance_photo.read'));

drop policy if exists class_attendance_photo_insert_admin on public.class_attendance_photo;
create policy class_attendance_photo_insert_admin
  on public.class_attendance_photo
  for insert
  with check (public.authorize('class_attendance_photo.create'));

drop policy if exists class_attendance_photo_update_admin on public.class_attendance_photo;
create policy class_attendance_photo_update_admin
  on public.class_attendance_photo
  for update
  using (public.authorize('class_attendance_photo.update'))
  with check (public.authorize('class_attendance_photo.update'));

drop policy if exists class_attendance_photo_delete_admin on public.class_attendance_photo;
create policy class_attendance_photo_delete_admin
  on public.class_attendance_photo
  for delete
  using (public.authorize('class_attendance_photo.delete'));

drop policy if exists class_attendance_photo_read_auth_admin on public.class_attendance_photo;
create policy class_attendance_photo_read_auth_admin
  on public.class_attendance_photo
  for select
  to supabase_auth_admin
  using (true);

drop policy if exists class_attendance_photo_upload_attempt_select_admin on public.class_attendance_photo_upload_attempt;
create policy class_attendance_photo_upload_attempt_select_admin
  on public.class_attendance_photo_upload_attempt
  for select
  using (public.authorize('class_attendance_photo_upload_attempt.read'));

drop policy if exists class_attendance_photo_upload_attempt_insert_admin on public.class_attendance_photo_upload_attempt;
create policy class_attendance_photo_upload_attempt_insert_admin
  on public.class_attendance_photo_upload_attempt
  for insert
  with check (public.authorize('class_attendance_photo_upload_attempt.create'));

drop policy if exists class_attendance_photo_upload_attempt_update_admin on public.class_attendance_photo_upload_attempt;
create policy class_attendance_photo_upload_attempt_update_admin
  on public.class_attendance_photo_upload_attempt
  for update
  using (public.authorize('class_attendance_photo_upload_attempt.update'))
  with check (public.authorize('class_attendance_photo_upload_attempt.update'));

drop policy if exists class_attendance_photo_upload_attempt_delete_admin on public.class_attendance_photo_upload_attempt;
create policy class_attendance_photo_upload_attempt_delete_admin
  on public.class_attendance_photo_upload_attempt
  for delete
  using (public.authorize('class_attendance_photo_upload_attempt.delete'));

drop policy if exists class_attendance_photo_upload_attempt_read_auth_admin on public.class_attendance_photo_upload_attempt;
create policy class_attendance_photo_upload_attempt_read_auth_admin
  on public.class_attendance_photo_upload_attempt
  for select
  to supabase_auth_admin
  using (true);

grant usage on type public.class_attendance_photo_upload_status to authenticated, supabase_auth_admin;

grant all on table public.class_attendance_photo to supabase_auth_admin;
grant all on table public.class_attendance_photo_upload_attempt to supabase_auth_admin;

revoke all on table public.class_attendance_photo from authenticated, anon, public;
revoke all on table public.class_attendance_photo_upload_attempt from authenticated, anon, public;

grant all on table public.class_attendance_photo to authenticated;
grant all on table public.class_attendance_photo_upload_attempt to authenticated;

insert into public.role_permission (role, permission)
select r.role, p.permission
from (values ('admin'::public.app_role), ('manager'::public.app_role)) as r(role)
cross join (
  values
    ('class_attendance_photo.create'::public.app_permissions),
    ('class_attendance_photo.read'::public.app_permissions),
    ('class_attendance_photo.update'::public.app_permissions),
    ('class_attendance_photo.delete'::public.app_permissions),
    ('class_attendance_photo_upload_attempt.create'::public.app_permissions),
    ('class_attendance_photo_upload_attempt.read'::public.app_permissions),
    ('class_attendance_photo_upload_attempt.update'::public.app_permissions),
    ('class_attendance_photo_upload_attempt.delete'::public.app_permissions)
) as p(permission)
on conflict do nothing;

insert into public.role_permission (role, permission)
select r.role, p.permission
from (values ('staff'::public.app_role)) as r(role)
cross join (
  values
    ('class_attendance_photo.read'::public.app_permissions),
    ('class_attendance_photo.update'::public.app_permissions),
    ('class_attendance_photo_upload_attempt.read'::public.app_permissions)
) as p(permission)
on conflict do nothing;

insert into storage.buckets (id, name, public)
values ('class-attendance-photos', 'class-attendance-photos', false)
on conflict (id) do nothing;

drop policy if exists storage_class_attendance_photos_staff_read on storage.objects;
drop policy if exists storage_class_attendance_photos_staff_write on storage.objects;
drop policy if exists storage_class_attendance_photos_staff_update on storage.objects;
drop policy if exists storage_class_attendance_photos_staff_delete on storage.objects;

create policy storage_class_attendance_photos_staff_read
  on storage.objects
  for select
  using (
    bucket_id = 'class-attendance-photos'
    and public.current_user_role() in ('admin', 'manager', 'staff')
  );

create policy storage_class_attendance_photos_staff_write
  on storage.objects
  for insert
  with check (
    bucket_id = 'class-attendance-photos'
    and public.current_user_role() in ('admin', 'manager', 'staff')
  );

create policy storage_class_attendance_photos_staff_update
  on storage.objects
  for update
  using (
    bucket_id = 'class-attendance-photos'
    and public.current_user_role() in ('admin', 'manager', 'staff')
  )
  with check (
    bucket_id = 'class-attendance-photos'
    and public.current_user_role() in ('admin', 'manager', 'staff')
  );

create policy storage_class_attendance_photos_staff_delete
  on storage.objects
  for delete
  using (
    bucket_id = 'class-attendance-photos'
    and public.current_user_role() in ('admin', 'manager', 'staff')
  );
