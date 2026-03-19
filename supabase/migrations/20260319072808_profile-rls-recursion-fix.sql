drop policy if exists "person_guardian_child_read_guardian" on public.person_guardian_child;
drop policy if exists "person_guardian_child_insert_guardian" on public.person_guardian_child;
drop policy if exists "person_guardian_child_update_guardian" on public.person_guardian_child;

create policy "person_guardian_child_read_guardian"
  on public.person_guardian_child
  for select
  to public
  using (
    guardian_profile_id = public.current_profile_id()
    or child_profile_id = public.current_profile_id()
  );

create policy "person_guardian_child_insert_guardian"
  on public.person_guardian_child
  for insert
  to public
  with check (
    guardian_profile_id = public.current_profile_id()
  );

create policy "person_guardian_child_update_guardian"
  on public.person_guardian_child
  for update
  to public
  using (
    guardian_profile_id = public.current_profile_id()
  )
  with check (
    guardian_profile_id = public.current_profile_id()
  );
