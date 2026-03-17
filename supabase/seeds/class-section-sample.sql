-- Seed a sample workshop section and scheduled workshops for local dev.
with semester as (
  insert into public.semester (
    id, starts_at, ends_at, enrollment_open_at, enrollment_close_at
  )
  values (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
    now() + interval '1 day',
    now() + interval '8 weeks',
    now(),
    now() + interval '6 weeks'
  )
  on conflict (id) do update
    set starts_at = excluded.starts_at,
        ends_at = excluded.ends_at,
        enrollment_open_at = excluded.enrollment_open_at,
        enrollment_close_at = excluded.enrollment_close_at
  returning id
),
section as (
  insert into public.workshop (
    id, semester_id, description, enrollment_open_at, enrollment_close_at, capacity, wait_list_capacity
  )
  values (
    '11111111-1111-1111-1111-111111111111'::uuid,
    (select id from semester),
    'Partner program class section for summer launch',
    now(),
    now() + interval '6 weeks',
    30,
    10
  )
  on conflict (id) do update
    set semester_id = excluded.semester_id,
        description = excluded.description,
        enrollment_open_at = excluded.enrollment_open_at,
        enrollment_close_at = excluded.enrollment_close_at,
        capacity = excluded.capacity,
        wait_list_capacity = excluded.wait_list_capacity
  returning id
)
insert into public.session (id, workshop_id, starts_at, ends_at, location)
values
  (
    '22222222-2222-2222-2222-222222222222'::uuid,
    (select id from section),
    now() + interval '7 days',
    now() + interval '7 days' + interval '90 minutes',
    'Cafeteria'
  ),
  (
    '33333333-3333-3333-3333-333333333333'::uuid,
    (select id from section),
    now() + interval '14 days',
    now() + interval '14 days' + interval '90 minutes',
    'Cafeteria'
  )
on conflict (id) do update
  set
    workshop_id = excluded.workshop_id,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    location = excluded.location;

insert into public.profile (id, role, firstname, surname)
values
  ('22222222-bbbb-bbbb-bbbb-222222222222'::uuid, 'student', 'Sample', 'Student')
on conflict (id) do update
  set role = excluded.role,
      firstname = excluded.firstname,
      surname = excluded.surname;

insert into public.session_attendance (session_id, profile_id, status)
values
  ('22222222-2222-2222-2222-222222222222'::uuid, '22222222-bbbb-bbbb-bbbb-222222222222'::uuid, 'present')
on conflict (session_id, profile_id) do update
  set status = excluded.status;
