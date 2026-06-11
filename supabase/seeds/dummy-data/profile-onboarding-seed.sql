-- Seed sample guardian/student profiles and guardian-child links.
insert into public.profile (
  id,
  role,
  email,
  firstname,
  surname,
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
    '11111111-aaaa-aaaa-aaaa-111111111111'::uuid,
    'guardian',
    'guardian1@example.com',
    'Amina',
    'Khan',
    '4165550101',
    '45 Overlea Blvd',
    'Toronto',
    'ON',
    'M4H 1C3',
    'Don Valley West',
    'Thorncliffe Park -TNO'
  ),
  (
    '22222222-bbbb-bbbb-bbbb-222222222222'::uuid,
    'student',
    null,
    'Layla',
    'Khan',
    null,
    '45 Overlea Blvd',
    'Toronto',
    'ON',
    'M4H 1C3',
    'Don Valley West',
    null
  ),
  (
    '33333333-cccc-cccc-cccc-333333333333'::uuid,
    'guardian',
    'guardian2@example.com',
    'Marco',
    'Silva',
    '4165550102',
    '2 Berkeley St',
    'Toronto',
    'ON',
    'M5A 4J5',
    'Toronto Centre',
    'Corktown Community'
  ),
  (
    '44444444-dddd-dddd-dddd-444444444444'::uuid,
    'student',
    null,
    'Noah',
    'Silva',
    null,
    '2 Berkeley St',
    'Toronto',
    'ON',
    'M5A 4J5',
    'Toronto Centre',
    null
  )
on conflict (id) do update
  set role = excluded.role,
      email = excluded.email,
      firstname = excluded.firstname,
      surname = excluded.surname,
      phone = excluded.phone,
      street_address = excluded.street_address,
      city = excluded.city,
      province = excluded.province,
      postcode = excluded.postcode,
      federal_electoral_district_name = excluded.federal_electoral_district_name,
      partner_program = excluded.partner_program;

insert into public.person_guardian_child (guardian_profile_id, child_profile_id, primary_child)
values
  ('11111111-aaaa-aaaa-aaaa-111111111111'::uuid, '22222222-bbbb-bbbb-bbbb-222222222222'::uuid, true),
  ('33333333-cccc-cccc-cccc-333333333333'::uuid, '44444444-dddd-dddd-dddd-444444444444'::uuid, true)
on conflict (guardian_profile_id, child_profile_id) do update
  set primary_child = excluded.primary_child;
