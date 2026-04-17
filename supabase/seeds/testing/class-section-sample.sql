-- Seed a sample workshop section and scheduled workshops for local dev.
with semester as (
  insert into public.semester (
    id, starts_at, ends_at, enrollment_open_at, enrollment_close_at
  )
  values (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
    now() - interval '20 weeks',
    now() - interval '12 weeks',
    now() - interval '24 weeks',
    now() - interval '21 weeks'
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
    'Partner program class section sample (historical)',
    now() - interval '24 weeks',
    now() - interval '21 weeks',
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
insert into public.class (id, workshop_id, starts_at, ends_at, location)
values
  (
    '22222222-2222-2222-2222-222222222222'::uuid,
    (select id from section),
    now() - interval '19 weeks',
    now() - interval '19 weeks' + interval '90 minutes',
    'Cafeteria'
  ),
  (
    '33333333-3333-3333-3333-333333333333'::uuid,
    (select id from section),
    now() - interval '18 weeks',
    now() - interval '18 weeks' + interval '90 minutes',
    'Cafeteria'
  )
on conflict (id) do update
  set
    workshop_id = excluded.workshop_id,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    location = excluded.location;

insert into public.profile (id, role, firstname, surname, email, phone, postcode, partner_program)
values
  ('22222222-bbbb-bbbb-bbbb-222222222222'::uuid, 'student', 'Sample', 'Student', 'sample.student@example.com', '4165550101', 'A1A 1A1', 'Thorncliffe Park -TNO'),
  ('11111111-bbbb-bbbb-bbbb-111111111111'::uuid, 'guardian', 'Jordan', 'Lee', 'jordan.lee@example.com', '4165550102', 'A1A 1A1', 'Thorncliffe Park -TNO'),
  ('33333333-bbbb-bbbb-bbbb-333333333333'::uuid, 'student', 'Avery', 'Lee', 'avery.lee@example.com', '4165550103', 'A1A 1A1', 'Thorncliffe Park -TNO')
on conflict (id) do update
  set role = excluded.role,
      firstname = excluded.firstname,
      surname = excluded.surname,
      email = excluded.email,
      phone = excluded.phone,
      postcode = excluded.postcode,
      partner_program = excluded.partner_program;

insert into public.person_guardian_child (guardian_profile_id, child_profile_id, primary_child)
values
  ('11111111-bbbb-bbbb-bbbb-111111111111'::uuid, '33333333-bbbb-bbbb-bbbb-333333333333'::uuid, true)
on conflict (guardian_profile_id, child_profile_id) do update
  set primary_child = excluded.primary_child;

with past_semester as (
  insert into public.semester (
    id, starts_at, ends_at, enrollment_open_at, enrollment_close_at
  )
  values (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid,
    now() - interval '8 weeks',
    now() - interval '1 week',
    now() - interval '12 weeks',
    now() - interval '9 weeks'
  )
  on conflict (id) do update
    set starts_at = excluded.starts_at,
        ends_at = excluded.ends_at,
        enrollment_open_at = excluded.enrollment_open_at,
        enrollment_close_at = excluded.enrollment_close_at
  returning id
), past_workshop as (
  insert into public.workshop (
    id, semester_id, description, enrollment_open_at, enrollment_close_at, capacity, wait_list_capacity
  )
  values (
    'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid,
    (select id from past_semester),
    'Past Semester - Family Cooking',
    now() - interval '12 weeks',
    now() - interval '9 weeks',
    20,
    5
  )
  on conflict (id) do update
    set semester_id = excluded.semester_id,
        description = excluded.description,
        enrollment_open_at = excluded.enrollment_open_at,
        enrollment_close_at = excluded.enrollment_close_at,
        capacity = excluded.capacity,
        wait_list_capacity = excluded.wait_list_capacity
  returning id
), past_class as (
  insert into public.class (id, workshop_id, starts_at, ends_at, location)
  values (
    'dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid,
    (select id from past_workshop),
    now() - interval '2 weeks',
    now() - interval '2 weeks' + interval '90 minutes',
    'Community Kitchen'
  )
  on conflict (id) do update
    set workshop_id = excluded.workshop_id,
        starts_at = excluded.starts_at,
        ends_at = excluded.ends_at,
        location = excluded.location
  returning id
)
insert into public.workshop_enrollment (workshop_id, semester_id, profile_id, status)
values
  ((select id from past_workshop), (select id from past_semester), '33333333-bbbb-bbbb-bbbb-333333333333'::uuid, 'approved'),
  ((select id from past_workshop), (select id from past_semester), '22222222-bbbb-bbbb-bbbb-222222222222'::uuid, 'approved')
on conflict (semester_id, profile_id) do update
  set status = excluded.status;

insert into public.class_attendance (class_id, profile_id, status)
values
  ('dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid, '33333333-bbbb-bbbb-bbbb-333333333333'::uuid, 'present'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid, '22222222-bbbb-bbbb-bbbb-222222222222'::uuid, null)
on conflict (class_id, profile_id) do update
  set status = excluded.status;
