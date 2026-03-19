-- Profile table storing guardian/student details
create table public.profile (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  role app_role not null,
  email text unique,
  firstname text,
  surname text,
  date_of_birth date,
  phone text,
  postcode text,
  partner_program text,
  password_set boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profile enable row level security;

create or replace function public.current_profile_id()
returns uuid
language sql
security definer
set search_path = public
set row_security = off
as $$
  select id
  from public.profile
  where user_id = auth.uid()
  limit 1
$$;

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

drop trigger if exists on_profile_updated_set_timestamp on public.profile;
create trigger on_profile_updated_set_timestamp
before update on public.profile
for each row execute function public.touch_profile_updated_at();

create policy profile_read_self
  on public.profile
  for select
  using (user_id = auth.uid());

create policy profile_update_self
  on public.profile
  for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy profile_insert_self_or_child
  on public.profile
  for insert
  with check (user_id = auth.uid() or user_id is null);

create policy profile_read_auth_admin
  on public.profile
  for select
  to supabase_auth_admin
  using (true);

grant all on table public.profile to supabase_auth_admin;
revoke all on table public.profile from authenticated, anon, public;
grant select, update, insert on table public.profile to authenticated;
