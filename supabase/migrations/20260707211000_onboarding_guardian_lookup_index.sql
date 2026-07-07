create index if not exists person_guardian_child_child_guardian_idx
  on public.person_guardian_child (child_profile_id, guardian_profile_id);
