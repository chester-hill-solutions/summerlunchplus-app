-- Pre-emptive hot-path indexes for family, enrollment, and class timeline lookups.

create index if not exists workshop_enrollment_profile_requested_idx
  on public.workshop_enrollment (profile_id, requested_at desc);

create index if not exists workshop_enrollment_workshop_status_idx
  on public.workshop_enrollment (workshop_id, status);

create index if not exists class_workshop_starts_idx
  on public.class (workshop_id, starts_at);

create index if not exists person_guardian_child_child_idx
  on public.person_guardian_child (child_profile_id);

create index if not exists profile_user_id_idx
  on public.profile (user_id);
