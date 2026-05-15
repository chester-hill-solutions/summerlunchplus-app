-- Demo seed data for discrepancy review workflows.
-- This creates a small family with conflicting addresses and two open suspicious signals.

insert into public.profile (
  id,
  role,
  firstname,
  surname,
  email,
  street_address,
  city,
  province,
  postcode
)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'guardian',
    'Gina',
    'Guardian',
    'seed.guardian.discrepancy@example.com',
    '100 Main Street',
    'Toronto',
    'ON',
    'M5V1A1'
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'student',
    'Sam',
    'Student',
    'seed.student.discrepancy@example.com',
    '900 Pine Avenue',
    'Vancouver',
    'BC',
    'V5K0A1'
  )
on conflict (id) do nothing;

insert into public.person_guardian_child (
  id,
  guardian_profile_id,
  child_profile_id,
  primary_child
)
values (
  '33333333-3333-4333-8333-333333333333',
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  true
)
on conflict (guardian_profile_id, child_profile_id)
do update set primary_child = excluded.primary_child;

insert into public.semester (
  id,
  name,
  description,
  starts_at,
  ends_at,
  enrollment_open_at,
  enrollment_close_at
)
values (
  '66666666-6666-4666-8666-666666666666',
  'Seed Semester - Discrepancy Demo',
  'Semester used for suspicious enrollment seed data.',
  '2026-06-01T00:00:00Z',
  '2026-08-31T23:59:59Z',
  '2026-05-01T00:00:00Z',
  '2026-07-15T23:59:59Z'
)
on conflict (id) do nothing;

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
  '77777777-7777-4777-8777-777777777777',
  '66666666-6666-4666-8666-666666666666',
  'Seed Workshop - Suspicious Enrollment Demo',
  '2026-05-15T00:00:00Z',
  '2026-07-01T00:00:00Z',
  20,
  10
)
on conflict (id) do nothing;

insert into public.workshop_enrollment (
  id,
  workshop_id,
  semester_id,
  profile_id,
  status,
  requested_at
)
values (
  '88888888-8888-4888-8888-888888888888',
  '77777777-7777-4777-8777-777777777777',
  '66666666-6666-4666-8666-666666666666',
  '22222222-2222-4222-8222-222222222222',
  'pending',
  now()
)
on conflict (id) do nothing;

insert into public.suspicious_signal (
  id,
  subject_profile_id,
  family_profile_ids,
  signal_type,
  severity,
  summary,
  details,
  status
)
values
  (
    '44444444-4444-4444-8444-444444444444',
    '22222222-2222-4222-8222-222222222222',
    array[
      '11111111-1111-4111-8111-111111111111'::uuid,
      '22222222-2222-4222-8222-222222222222'::uuid
    ],
    'address_mismatch',
    'medium',
    'Linked family members submitted different addresses.',
    jsonb_build_object(
      'title',
      'Family address mismatch',
      'profiles',
      jsonb_build_array(
        jsonb_build_object(
          'profile_id',
          '11111111-1111-4111-8111-111111111111',
          'role',
          'guardian',
          'label',
          'Gina Guardian',
          'street_address',
          '100 Main Street',
          'city',
          'Toronto',
          'province',
          'ON',
          'postcode',
          'M5V1A1'
        ),
        jsonb_build_object(
          'profile_id',
          '22222222-2222-4222-8222-222222222222',
          'role',
          'student',
          'label',
          'Sam Student',
          'street_address',
          '900 Pine Avenue',
          'city',
          'Vancouver',
          'province',
          'BC',
          'postcode',
          'V5K0A1'
        )
      ),
      'distinct_address_count',
      2
    ),
    'open'
  ),
  (
    '55555555-5555-4555-8555-555555555555',
    '22222222-2222-4222-8222-222222222222',
    array[
      '11111111-1111-4111-8111-111111111111'::uuid,
      '22222222-2222-4222-8222-222222222222'::uuid
    ],
    'network_distance_anomaly',
    'high',
    'Recent family submissions show a large timezone offset gap.',
    jsonb_build_object(
      'title',
      'Suspicious network/location pattern',
      'offset_range_minutes',
      360,
      'distinct_ip_count',
      2,
      'evidence_window_hours',
      2,
      'recent_submissions',
      jsonb_build_array(
        jsonb_build_object(
          'profile_id',
          '11111111-1111-4111-8111-111111111111',
          'submitted_at_local',
          'May 15, 2026, 9:00 AM',
          'ip_address',
          '198.51.100.10',
          'client_offset_minutes',
          240
        ),
        jsonb_build_object(
          'profile_id',
          '22222222-2222-4222-8222-222222222222',
          'submitted_at_local',
          'May 15, 2026, 9:10 AM',
          'ip_address',
          '203.0.113.77',
          'client_offset_minutes',
          -120
        )
      )
    ),
    'open'
  )
on conflict (id) do nothing;
