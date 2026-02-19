-- Role enum and assignment table with RLS and auth hook for custom JWT claims (Supabase docs aligned).

-- Enum for app roles.
create type app_role as enum (
  'unassigned',
  'admin',
  'manager',
  'staff',
  'instructor',
  'student',
  'parent'
);

create type app_permissions as enum (
  'site.read',
  'form.create', 'form.read', 'form.update', 'form.delete',
  'form_question.create', 'form_question.read', 'form_question.update', 'form_question.delete',
  'form_assignment.create', 'form_assignment.read', 'form_assignment.update', 'form_assignment.delete',
  'form_submission.create', 'form_submission.read', 'form_submission.update', 'form_submission.delete',
  'form_answer.create', 'form_answer.read', 'form_answer.update', 'form_answer.delete',
  'semester.create', 'semester.read', 'semester.update', 'semester.delete',
  'cohort.create', 'cohort.read', 'cohort.update', 'cohort.delete',
  'class.create', 'class.read', 'class.update', 'class.delete',
  'cohort_enrollment.create', 'cohort_enrollment.read', 'cohort_enrollment.update', 'cohort_enrollment.update_status',
  'user_roles.manage', 'role_permission.manage',
  'profiles.read', 'profiles.update'
);

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users on delete cascade,
  role app_role not null default 'unassigned',
  assigned_by uuid references auth.users,
  created_at timestamptz not null default now()
);

create table public.role_permission (
  role app_role not null,
  permission app_permissions not null,
  primary key (role, permission)
);

alter table public.user_roles enable row level security;
alter table public.role_permission enable row level security;

-- Admins/managers manage roles.
create or replace function public.current_user_role()
returns app_role
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(
    nullif((current_setting('request.jwt.claims', true)::jsonb ->> 'user_role'), '')::app_role,
    'unassigned'::app_role
  );
$$;

create or replace function public.authorize(requested_permission app_permissions)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  bind_permissions int;
  user_role public.app_role;
begin
  select coalesce(
    nullif((current_setting('request.jwt.claims', true)::jsonb ->> 'user_role'), '')::public.app_role,
    'unassigned'::public.app_role
  ) into user_role;

  select count(*)
    into bind_permissions
    from public.role_permission
    where role_permission.permission = requested_permission
      and role_permission.role = user_role;

  return bind_permissions > 0;
end;
$$;

create policy user_roles_write_admin
  on public.user_roles
  for all
  using (public.authorize('user_roles.manage'))
  with check (public.authorize('user_roles.manage'));

create policy role_permission_admin_manage
  on public.role_permission
  for all
  using (public.authorize('role_permission.manage'))
  with check (public.authorize('role_permission.manage'));

-- Users can read their own role.
create policy user_roles_read_self
  on public.user_roles
  for select
  using (user_id = auth.uid());

-- Allow auth hook role to read roles.
create policy user_roles_read_auth_admin
  on public.user_roles
  for select
  to supabase_auth_admin
  using (true);

create policy role_permission_read_auth_admin
  on public.role_permission
  for select
  to supabase_auth_admin
  using (true);

-- Grants per docs: auth admin reads tables; others revoked.
grant usage on schema public to supabase_auth_admin;

grant all on table public.user_roles to supabase_auth_admin;
revoke all on table public.user_roles from authenticated, anon, public;

grant all on table public.role_permission to supabase_auth_admin;
revoke all on table public.role_permission from authenticated, anon, public;

-- Grants for application users (RLS still applies).
grant all on table public.user_roles to authenticated;
grant usage on type app_role to authenticated, supabase_auth_admin;
grant all on table public.role_permission to authenticated;
grant usage on type app_permissions to authenticated, supabase_auth_admin;
grant execute on function public.current_user_role() to authenticated, supabase_auth_admin;
grant execute on function public.authorize(app_permissions) to authenticated, supabase_auth_admin;

insert into public.role_permission (role, permission)
select r.role, p.permission
from (values ('admin'::app_role), ('manager'::app_role)) as r(role)
cross join (select unnest(enum_range(null::app_permissions)) as permission) p
on conflict do nothing;
grant execute on function public.current_user_role() to authenticated, supabase_auth_admin;

-- Auto-provision a user role on signup.
create or replace function public.handle_new_user_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_roles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_set_role on auth.users;
create trigger on_auth_user_created_set_role
after insert on auth.users
for each row execute function public.handle_new_user_role();

-- Backfill any missing roles.
insert into public.user_roles (user_id)
select id from auth.users u
where not exists (select 1 from public.user_roles r where r.user_id = u.id);

-- Profiles table to avoid repeated auth lookups.
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create or replace function public.handle_new_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_create_profile on auth.users;
create trigger on_auth_user_created_create_profile
after insert on auth.users
for each row execute function public.handle_new_profile();

-- Keep profile updated_at fresh on updates.
create or replace function public.touch_profile_updated_at()
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

drop trigger if exists on_profile_updated_set_timestamp on public.profiles;
create trigger on_profile_updated_set_timestamp
before update on public.profiles
for each row execute function public.touch_profile_updated_at();

-- Backfill profiles for existing users.
insert into public.profiles (id, email)
select id, email from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

-- Policies for profiles.
create policy profiles_read_self
  on public.profiles
  for select
  using (id = auth.uid());

create policy profiles_update_self
  on public.profiles
  for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- Admin auth role read access.
create policy profiles_read_auth_admin
  on public.profiles
  for select
  to supabase_auth_admin
  using (true);

-- Grants for profiles.
grant all on table public.profiles to supabase_auth_admin;
revoke all on table public.profiles from authenticated, anon, public;
grant select, update on table public.profiles to authenticated;
