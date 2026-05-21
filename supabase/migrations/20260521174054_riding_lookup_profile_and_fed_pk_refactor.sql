alter table public.profile
  add column if not exists federal_electoral_district_name text,
  add column if not exists riding_lookup_status text,
  add column if not exists riding_lookup_last_attempt_at timestamptz,
  add column if not exists riding_lookup_error text;

alter table public.federal_electoral_district
  alter column name set not null;

alter table public.federal_electoral_district
  drop constraint if exists federal_electoral_district_pkey;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'federal_electoral_district'
      and column_name = 'id'
  ) then
    alter table public.federal_electoral_district drop column id;
  end if;
end $$;

alter table public.federal_electoral_district
  add constraint federal_electoral_district_pkey primary key (name);

alter table public.profile
  drop constraint if exists profile_federal_electoral_district_name_fkey;

alter table public.profile
  add constraint profile_federal_electoral_district_name_fkey
  foreign key (federal_electoral_district_name)
  references public.federal_electoral_district(name)
  on delete set null;

create index if not exists profile_federal_electoral_district_name_idx
  on public.profile (federal_electoral_district_name);

alter table public.profile
  drop constraint if exists profile_riding_lookup_status_chk;

alter table public.profile
  add constraint profile_riding_lookup_status_chk
  check (
    riding_lookup_status is null
    or riding_lookup_status in ('matched', 'not_found', 'error', 'skipped')
  );
