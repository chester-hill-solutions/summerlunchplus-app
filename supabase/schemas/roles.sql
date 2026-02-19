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

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users on delete cascade,
  role app_role not null default 'unassigned',
  assigned_by uuid references auth.users,
  created_at timestamptz not null default now()
);

alter table public.user_roles enable row level security;

-- Admins/managers manage roles.
create policy user_roles_write_admin
  on public.user_roles
  for all
  using (auth.jwt()->>'role' in ('admin','manager'))
  with check (auth.jwt()->>'role' in ('admin','manager'));

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

-- Helper function used by auth access token hook (doc style).
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
  declare
    claims jsonb;
    user_role app_role;
  begin
    select role into user_role from public.user_roles where user_id = (event->>'user_id')::uuid;
    claims := coalesce(event->'claims', '{}'::jsonb);
    claims := jsonb_set(
      claims,
      '{user_role}',
      to_jsonb(coalesce(user_role, 'unassigned'::app_role))
    );
    event := jsonb_set(event, '{claims}', claims);
    return event;
  end;
$$;

-- Hook registration is handled via config (see supabase/config.toml [auth.hook.custom_access_token]).

-- Grants per docs: auth admin executes hook and reads table; others revoked.
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;

grant all on table public.user_roles to supabase_auth_admin;
revoke all on table public.user_roles from authenticated, anon, public;

-- Grants for application users (RLS still applies).
grant all on table public.user_roles to authenticated;
grant usage on type app_role to authenticated, supabase_auth_admin;

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
