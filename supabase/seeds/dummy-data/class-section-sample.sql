-- Seed enrollment and attendance scenarios for prior and current semesters.

insert into public.profile (id, role, firstname, surname, email, phone, postcode, partner_program)
values
  ('22222222-bbbb-bbbb-bbbb-222222222222'::uuid, 'student', 'Layla', 'Khan', null, null, null, null),
  ('33333333-bbbb-bbbb-bbbb-333333333333'::uuid, 'student', 'Avery', 'Lee', 'avery.lee@example.com', '4165550103', 'A1A 1A1', 'Thorncliffe Park -TNO'),
  ('44444444-dddd-dddd-dddd-444444444444'::uuid, 'student', 'Noah', 'Silva', null, null, null, null),
  ('55555555-eeee-eeee-eeee-555555555555'::uuid, 'student', 'Mina', 'Patel', null, null, null, null),
  ('66666666-ffff-ffff-ffff-666666666666'::uuid, 'student', 'Sofia', 'Nguyen', null, null, null, null),
  ('77777777-1111-1111-1111-777777777777'::uuid, 'student', 'Arjun', 'Singh', null, null, null, null),
  ('88888888-2222-2222-2222-888888888888'::uuid, 'student', 'Rayan', 'Ali', null, null, null, null),
  ('99999999-3333-3333-3333-999999999999'::uuid, 'student', 'Zara', 'Brown', null, null, null, null),
  ('aaaaaaaa-4444-4444-4444-aaaaaaaa4444'::uuid, 'student', 'Ibrahim', 'Ahmed', null, null, null, null),
  ('bbbbbbbb-5555-5555-5555-bbbbbbbb5555'::uuid, 'student', 'Mila', 'Johnson', null, null, null, null),
  ('cccccccc-6666-6666-6666-cccccccc6666'::uuid, 'student', 'Lucas', 'Wilson', null, null, null, null),
  ('dddddddd-7777-7777-7777-dddddddd7777'::uuid, 'student', 'Aisha', 'Martin', null, null, null, null),
  ('eeeeeeee-8888-8888-8888-eeeeeeee8888'::uuid, 'student', 'Omar', 'Garcia', null, null, null, null)
on conflict (id) do update
  set role = excluded.role,
      firstname = excluded.firstname,
      surname = excluded.surname,
      email = excluded.email,
      phone = excluded.phone,
      postcode = excluded.postcode,
      partner_program = excluded.partner_program;

insert into public.semester (id, starts_at, ends_at, enrollment_open_at, enrollment_close_at)
values (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  date_trunc('year', now()) - interval '1 year' + interval '5 months',
  date_trunc('year', now()) - interval '1 year' + interval '6 months' - interval '1 second',
  date_trunc('year', now()) - interval '1 year' + interval '3 months',
  date_trunc('year', now()) - interval '1 year' + interval '5 months' - interval '1 second'
)
on conflict (id) do update
  set starts_at = excluded.starts_at,
      ends_at = excluded.ends_at,
      enrollment_open_at = excluded.enrollment_open_at,
      enrollment_close_at = excluded.enrollment_close_at;

insert into public.workshop (
  id,
  semester_id,
  description,
  enrollment_open_at,
  enrollment_close_at,
  capacity,
  wait_list_capacity
)
values (
  '11111111-1111-1111-1111-111111111111'::uuid,
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  'Prior Semester - Family Cooking',
  date_trunc('year', now()) - interval '1 year' + interval '3 months',
  date_trunc('year', now()) - interval '1 year' + interval '5 months' - interval '1 second',
  5,
  2
)
on conflict (id) do update
  set semester_id = excluded.semester_id,
      description = excluded.description,
      enrollment_open_at = excluded.enrollment_open_at,
      enrollment_close_at = excluded.enrollment_close_at,
      capacity = excluded.capacity,
      wait_list_capacity = excluded.wait_list_capacity;

insert into public.class (id, workshop_id, starts_at, ends_at, location)
values
  (
    'aaaaaaaa-1111-1111-1111-aaaaaaaa1111'::uuid,
    '11111111-1111-1111-1111-111111111111'::uuid,
    date_trunc('year', now()) - interval '1 year' + interval '5 months' + interval '6 days 16 hours',
    date_trunc('year', now()) - interval '1 year' + interval '5 months' + interval '6 days 17 hours 30 minutes',
    'Community Kitchen'
  ),
  (
    'aaaaaaaa-2222-2222-2222-aaaaaaaa2222'::uuid,
    '11111111-1111-1111-1111-111111111111'::uuid,
    date_trunc('year', now()) - interval '1 year' + interval '5 months' + interval '13 days 16 hours',
    date_trunc('year', now()) - interval '1 year' + interval '5 months' + interval '13 days 17 hours 30 minutes',
    'Community Kitchen'
  )
on conflict (id) do update
  set workshop_id = excluded.workshop_id,
      starts_at = excluded.starts_at,
      ends_at = excluded.ends_at,
      location = excluded.location;

insert into public.workshop_enrollment (workshop_id, semester_id, profile_id, status)
values
  ('11111111-1111-1111-1111-111111111111'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, '22222222-bbbb-bbbb-bbbb-222222222222'::uuid, 'approved'),
  ('11111111-1111-1111-1111-111111111111'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, '33333333-bbbb-bbbb-bbbb-333333333333'::uuid, 'approved'),
  ('11111111-1111-1111-1111-111111111111'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, '44444444-dddd-dddd-dddd-444444444444'::uuid, 'approved')
on conflict (semester_id, profile_id) do update
  set workshop_id = excluded.workshop_id,
      status = excluded.status;

insert into public.class_attendance (class_id, profile_id, status)
values
  ('aaaaaaaa-1111-1111-1111-aaaaaaaa1111'::uuid, '22222222-bbbb-bbbb-bbbb-222222222222'::uuid, 'present'),
  ('aaaaaaaa-1111-1111-1111-aaaaaaaa1111'::uuid, '33333333-bbbb-bbbb-bbbb-333333333333'::uuid, 'present'),
  ('aaaaaaaa-1111-1111-1111-aaaaaaaa1111'::uuid, '44444444-dddd-dddd-dddd-444444444444'::uuid, 'absent'),
  ('aaaaaaaa-2222-2222-2222-aaaaaaaa2222'::uuid, '22222222-bbbb-bbbb-bbbb-222222222222'::uuid, 'present'),
  ('aaaaaaaa-2222-2222-2222-aaaaaaaa2222'::uuid, '33333333-bbbb-bbbb-bbbb-333333333333'::uuid, 'absent'),
  ('aaaaaaaa-2222-2222-2222-aaaaaaaa2222'::uuid, '44444444-dddd-dddd-dddd-444444444444'::uuid, 'present')
on conflict (class_id, profile_id) do update
  set status = excluded.status;

insert into public.semester (id, starts_at, ends_at, enrollment_open_at, enrollment_close_at)
values (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid,
  date_trunc('year', now()) + interval '5 months',
  date_trunc('year', now()) + interval '6 months' - interval '1 second',
  date_trunc('year', now()) + interval '3 months',
  date_trunc('year', now()) + interval '5 months' - interval '1 second'
)
on conflict (id) do update
  set starts_at = excluded.starts_at,
      ends_at = excluded.ends_at,
      enrollment_open_at = excluded.enrollment_open_at,
      enrollment_close_at = excluded.enrollment_close_at;

insert into public.workshop (
  id,
  semester_id,
  description,
  enrollment_open_at,
  enrollment_close_at,
  capacity,
  wait_list_capacity
)
values
  (
    'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid,
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid,
    'June Session A - Overflow Interest',
    date_trunc('year', now()) + interval '3 months',
    date_trunc('year', now()) + interval '5 months' - interval '1 second',
    5,
    2
  ),
  (
    'dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid,
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid,
    'June Session B - Waitlist In Progress',
    date_trunc('year', now()) + interval '3 months',
    date_trunc('year', now()) + interval '5 months' - interval '1 second',
    5,
    2
  )
on conflict (id) do update
  set semester_id = excluded.semester_id,
      description = excluded.description,
      enrollment_open_at = excluded.enrollment_open_at,
      enrollment_close_at = excluded.enrollment_close_at,
      capacity = excluded.capacity,
      wait_list_capacity = excluded.wait_list_capacity;

insert into public.class (id, workshop_id, starts_at, ends_at, location)
values
  (
    'bbbbbbbb-1111-1111-1111-bbbbbbbb1111'::uuid,
    'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid,
    date_trunc('year', now()) + interval '5 months' + interval '5 days 16 hours',
    date_trunc('year', now()) + interval '5 months' + interval '5 days 17 hours 30 minutes',
    'Community Kitchen'
  ),
  (
    'bbbbbbbb-2222-2222-2222-bbbbbbbb2222'::uuid,
    'dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid,
    date_trunc('year', now()) + interval '5 months' + interval '7 days 17 hours',
    date_trunc('year', now()) + interval '5 months' + interval '7 days 18 hours 30 minutes',
    'Community Kitchen'
  )
on conflict (id) do update
  set workshop_id = excluded.workshop_id,
      starts_at = excluded.starts_at,
      ends_at = excluded.ends_at,
      location = excluded.location;

insert into public.workshop_enrollment (workshop_id, semester_id, profile_id, status)
values
  -- Workshop A: accepted < capacity (4 < 5), total enrollments > capacity (7 > 5)
  ('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, '22222222-bbbb-bbbb-bbbb-222222222222'::uuid, 'approved'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, '33333333-bbbb-bbbb-bbbb-333333333333'::uuid, 'approved'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, '44444444-dddd-dddd-dddd-444444444444'::uuid, 'approved'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, '55555555-eeee-eeee-eeee-555555555555'::uuid, 'approved'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, '66666666-ffff-ffff-ffff-666666666666'::uuid, 'pending'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, '77777777-1111-1111-1111-777777777777'::uuid, 'pending'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, '88888888-2222-2222-2222-888888888888'::uuid, 'waitlisted'),

  -- Workshop B: accepted == capacity (5), waitlisted < waitlist capacity (1 < 2)
  ('dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, '99999999-3333-3333-3333-999999999999'::uuid, 'approved'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, 'aaaaaaaa-4444-4444-4444-aaaaaaaa4444'::uuid, 'approved'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, 'bbbbbbbb-5555-5555-5555-bbbbbbbb5555'::uuid, 'approved'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, 'cccccccc-6666-6666-6666-cccccccc6666'::uuid, 'approved'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, 'dddddddd-7777-7777-7777-dddddddd7777'::uuid, 'approved'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, 'eeeeeeee-8888-8888-8888-eeeeeeee8888'::uuid, 'waitlisted')
on conflict (semester_id, profile_id) do update
  set workshop_id = excluded.workshop_id,
      status = excluded.status;
