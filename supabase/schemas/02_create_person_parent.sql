-- Junction table linking students to guardians
create table public.person_guardian_child (
  id uuid primary key default gen_random_uuid(),
  child_profile_id uuid not null references public.profile(id) on delete cascade,
  guardian_profile_id uuid not null references public.profile(id) on delete cascade,
  primary_child boolean not null default false,
  unique (guardian_profile_id, child_profile_id)
);

create unique index person_guardian_child_primary_one
  on public.person_guardian_child (guardian_profile_id)
  where primary_child = true;

alter table public.person_guardian_child enable row level security;

create policy person_guardian_child_read_guardian
  on public.person_guardian_child
  for select
  using (
    guardian_profile_id in (
      select p.id from public.profile p where p.user_id = auth.uid()
    )
    or child_profile_id in (
      select pgc.child_profile_id
      from public.person_guardian_child pgc
      join public.profile p on p.id = pgc.guardian_profile_id
      where p.user_id = auth.uid()
    )
  );

create policy person_guardian_child_insert_guardian
  on public.person_guardian_child
  for insert
  with check (
    guardian_profile_id in (
      select p.id from public.profile p where p.user_id = auth.uid()
    )
  );

create policy person_guardian_child_update_guardian
  on public.person_guardian_child
  for update
  using (
    guardian_profile_id in (
      select p.id from public.profile p where p.user_id = auth.uid()
    )
  )
  with check (
    guardian_profile_id in (
      select p.id from public.profile p where p.user_id = auth.uid()
    )
  );

create policy person_guardian_child_read_auth_admin
  on public.person_guardian_child
  for select
  to supabase_auth_admin
  using (true);

create policy profile_read_guardian_child
  on public.profile
  for select
  using (
    id in (
      select pgc.child_profile_id
      from public.person_guardian_child pgc
      join public.profile p on p.id = pgc.guardian_profile_id
      where p.user_id = auth.uid()
    )
  );

grant all on table public.person_guardian_child to supabase_auth_admin;
revoke all on table public.person_guardian_child from authenticated, anon, public;
grant select, insert, update on table public.person_guardian_child to authenticated;
