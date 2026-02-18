-- Role enum and assignment table with RLS and auth hook for custom JWT claims (Supabase docs aligned).

-- Enum for app roles.
create type app_role as enum (
  'admin',
  'manager',
  'staff',
  'instructor',
  'student',
  'parent'
);

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users on delete cascade,
  role app_role not null default 'student',
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
as $$
  declare
    claims jsonb;
    user_role app_role;
  begin
    select role into user_role from public.user_roles where user_id = (event->>'user_id')::uuid;
    claims := event->'claims';
    if user_role is not null then
      claims := jsonb_set(claims, '{user_role}', to_jsonb(user_role));
    else
      claims := jsonb_set(claims, '{user_role}', 'null');
    end if;
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
