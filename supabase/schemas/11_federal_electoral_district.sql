create table if not exists public.federal_electoral_district (
  name text primary key,
  code integer not null unique,
  whitelist boolean not null default false,
  meal_kit boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists federal_electoral_district_code_idx
  on public.federal_electoral_district (code);

create index if not exists federal_electoral_district_name_idx
  on public.federal_electoral_district (name);

create or replace function public.touch_federal_electoral_district_updated_at()
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

drop trigger if exists on_federal_electoral_district_updated_set_timestamp on public.federal_electoral_district;
create trigger on_federal_electoral_district_updated_set_timestamp
before update on public.federal_electoral_district
for each row execute function public.touch_federal_electoral_district_updated_at();

alter table public.federal_electoral_district enable row level security;

create policy federal_electoral_district_read_authorized
  on public.federal_electoral_district
  for select
  using (public.authorize('form.read'));

create policy federal_electoral_district_insert_authorized
  on public.federal_electoral_district
  for insert
  with check (public.authorize('form.update'));

create policy federal_electoral_district_update_authorized
  on public.federal_electoral_district
  for update
  using (public.authorize('form.update'))
  with check (public.authorize('form.update'));

create policy federal_electoral_district_delete_authorized
  on public.federal_electoral_district
  for delete
  using (public.authorize('form.update'));

create policy federal_electoral_district_read_auth_admin
  on public.federal_electoral_district
  for select
  to supabase_auth_admin
  using (true);

create policy federal_electoral_district_insert_auth_admin
  on public.federal_electoral_district
  for insert
  to supabase_auth_admin
  with check (true);

create policy federal_electoral_district_update_auth_admin
  on public.federal_electoral_district
  for update
  to supabase_auth_admin
  using (true)
  with check (true);

create policy federal_electoral_district_delete_auth_admin
  on public.federal_electoral_district
  for delete
  to supabase_auth_admin
  using (true);

grant all on table public.federal_electoral_district to supabase_auth_admin;

revoke all on table public.federal_electoral_district from authenticated, anon, public;
grant select, insert, update, delete on table public.federal_electoral_district to authenticated;
