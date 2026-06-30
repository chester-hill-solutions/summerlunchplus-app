-- Seed enrollment and attendance scenarios using fewer students and semesters.

insert into public.profile (
  id,
  role,
  firstname,
  surname,
  email,
  phone,
  street_address,
  city,
  province,
  postcode,
  federal_electoral_district_name,
  partner_program
)
values
  (
    '22222222-bbbb-bbbb-bbbb-222222222222'::uuid,
    'student',
    'Layla',
    'Khan',
    null,
    null,
    '45 Overlea Blvd',
    'Toronto',
    'ON',
    'M4H 1C3',
    'Don Valley West',
    null
  ),
  (
    '33333333-bbbb-bbbb-bbbb-333333333333'::uuid,
    'student',
    'Avery',
    'Lee',
    'avery.lee@chsolutions.ca',
    '4165550103',
    '91 Rylander Blvd',
    'Toronto',
    'ON',
    'M1B 5M5',
    'Scarborough North',
    'Thorncliffe Park -TNO'
  ),
  (
    '44444444-dddd-dddd-dddd-444444444444'::uuid,
    'student',
    'Noah',
    'Silva',
    null,
    null,
    '2 Berkeley St',
    'Toronto',
    'ON',
    'M5A 4J5',
    'Toronto Centre',
    null
  ),
  (
    '55555555-eeee-eeee-eeee-555555555555'::uuid,
    'student',
    'Mina',
    'Patel',
    null,
    null,
    '1050 Kipling Ave',
    'Etobicoke',
    'ON',
    'M9B 5L6',
    'Etobicoke Centre',
    null
  ),
  (
    '66666666-ffff-ffff-ffff-666666666666'::uuid,
    'student',
    'Sofia',
    'Nguyen',
    null,
    null,
    '150 Borough Dr',
    'Scarborough',
    'ON',
    'M1P 4N7',
    'Scarborough Centre—Don Valley East',
    null
  ),
  (
    '77777777-1111-1111-1111-777777777777'::uuid,
    'student',
    'Arjun',
    'Singh',
    null,
    null,
    '30 Regent St',
    'Toronto',
    'ON',
    'M5A 0E2',
    'Toronto Centre',
    null
  )
on conflict (id) do update
  set role = excluded.role,
      firstname = excluded.firstname,
      surname = excluded.surname,
      email = excluded.email,
      phone = excluded.phone,
      street_address = excluded.street_address,
      city = excluded.city,
      province = excluded.province,
      postcode = excluded.postcode,
      federal_electoral_district_name = excluded.federal_electoral_district_name,
      partner_program = excluded.partner_program;

insert into public.semester (id, name, description, starts_at, ends_at, enrollment_open_at, enrollment_close_at)
values
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
    'Prior Summer Semester',
    'Previous-year semester for attendance and gift-card reconciliation scenarios.',
    date_trunc('year', now()) - interval '1 year' + interval '5 months',
    date_trunc('year', now()) - interval '1 year' + interval '6 months' - interval '1 second',
    now() - interval '300 days',
    now() - interval '180 days'
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid,
    'Current Summer Semester',
    'Current-year semester for approved, pending, waitlisted, and declined states.',
    now() + interval '14 days',
    now() + interval '120 days',
    now() - interval '30 days',
    now() + interval '45 days'
  )
on conflict (id) do update
  set name = excluded.name,
      description = excluded.description,
      starts_at = excluded.starts_at,
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
    '11111111-1111-1111-1111-111111111111'::uuid,
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
    'Prior Semester - Family Cooking',
    now() - interval '360 days',
    now() - interval '210 days',
    4,
    2
  ),
  (
    'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid,
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid,
    'Current Session A - Enrollment Triage',
    now() - interval '30 days',
    now() + interval '45 days',
    3,
    2
  ),
  (
    'dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid,
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid,
    'Current Session B - Remaining Capacity',
    now() - interval '30 days',
    now() + interval '45 days',
    2,
    1
  )
on conflict (id) do update
  set semester_id = excluded.semester_id,
      description = excluded.description,
      enrollment_open_at = excluded.enrollment_open_at,
      enrollment_close_at = excluded.enrollment_close_at,
      capacity = excluded.capacity,
      wait_list_capacity = excluded.wait_list_capacity;

insert into public.class (id, workshop_id, starts_at, ends_at)
values
  (
    'aaaaaaaa-1111-1111-1111-aaaaaaaa1111'::uuid,
    '11111111-1111-1111-1111-111111111111'::uuid,
    date_trunc('year', now()) - interval '1 year' + interval '5 months' + interval '6 days 16 hours',
    date_trunc('year', now()) - interval '1 year' + interval '5 months' + interval '6 days 17 hours 30 minutes'
  ),
  (
    'bbbbbbbb-1111-1111-1111-bbbbbbbb1111'::uuid,
    'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid,
    now() + interval '20 days',
    now() + interval '20 days 90 minutes'
  ),
  (
    'bbbbbbbb-2222-2222-2222-bbbbbbbb2222'::uuid,
    'dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid,
    now() + interval '22 days',
    now() + interval '22 days 90 minutes'
  )
on conflict (id) do update
  set workshop_id = excluded.workshop_id,
      starts_at = excluded.starts_at,
      ends_at = excluded.ends_at;

insert into public.workshop_enrollment (workshop_id, semester_id, profile_id, status)
values
  ('11111111-1111-1111-1111-111111111111'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, '22222222-bbbb-bbbb-bbbb-222222222222'::uuid, 'approved'),
  ('11111111-1111-1111-1111-111111111111'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, '33333333-bbbb-bbbb-bbbb-333333333333'::uuid, 'revoked'),
  ('11111111-1111-1111-1111-111111111111'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, '44444444-dddd-dddd-dddd-444444444444'::uuid, 'approved'),

  ('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, '22222222-bbbb-bbbb-bbbb-222222222222'::uuid, 'approved'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, '33333333-bbbb-bbbb-bbbb-333333333333'::uuid, 'pending'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, '44444444-dddd-dddd-dddd-444444444444'::uuid, 'waitlisted'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, '55555555-eeee-eeee-eeee-555555555555'::uuid, 'rejected'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, '66666666-ffff-ffff-ffff-666666666666'::uuid, 'approved'),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, '77777777-1111-1111-1111-777777777777'::uuid, 'pending')
on conflict (semester_id, profile_id) do update
  set workshop_id = excluded.workshop_id,
      status = excluded.status;

insert into public.class_attendance (class_id, profile_id, status)
values
  ('aaaaaaaa-1111-1111-1111-aaaaaaaa1111'::uuid, '22222222-bbbb-bbbb-bbbb-222222222222'::uuid, 'present'),
  ('aaaaaaaa-1111-1111-1111-aaaaaaaa1111'::uuid, '33333333-bbbb-bbbb-bbbb-333333333333'::uuid, 'absent'),
  ('aaaaaaaa-1111-1111-1111-aaaaaaaa1111'::uuid, '44444444-dddd-dddd-dddd-444444444444'::uuid, 'present'),
  ('bbbbbbbb-1111-1111-1111-bbbbbbbb1111'::uuid, '22222222-bbbb-bbbb-bbbb-222222222222'::uuid, 'unknown'),
  ('bbbbbbbb-2222-2222-2222-bbbbbbbb2222'::uuid, '66666666-ffff-ffff-ffff-666666666666'::uuid, 'present')
on conflict (class_id, profile_id) do update
  set status = excluded.status;
