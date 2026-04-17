drop policy if exists workshop_enrollment_select_self on public.workshop_enrollment;
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

drop policy if exists workshop_enrollment_insert_self on public.workshop_enrollment;
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
    and coalesce(status, 'pending') = 'pending'
  );
