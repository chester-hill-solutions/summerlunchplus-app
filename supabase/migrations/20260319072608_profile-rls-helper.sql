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

drop policy if exists "profile_read_guardian_child" on public.profile;
create policy "profile_read_guardian_child"
  on public.profile
  for select
  to public
  using (
    id in (
      select pgc.child_profile_id
      from public.person_guardian_child pgc
      where pgc.guardian_profile_id = public.current_profile_id()
    )
  );
