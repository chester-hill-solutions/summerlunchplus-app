-- Seed sample guardian/student profiles and guardian-child links.
insert into public.profile (id, role, email, firstname, surname, phone, postcode, partner_program)
values
  ('11111111-aaaa-aaaa-aaaa-111111111111'::uuid, 'guardian', 'guardian1@example.com', 'Amina', 'Khan', '4165550101', 'A1A 1A1', 'Thorncliffe Park -TNO'),
  ('22222222-bbbb-bbbb-bbbb-222222222222'::uuid, 'student', null, 'Layla', 'Khan', null, null, null),
  ('33333333-cccc-cccc-cccc-333333333333'::uuid, 'guardian', 'guardian2@example.com', 'Marco', 'Silva', '4165550102', 'B2B 2B2', 'Corktown Community'),
  ('44444444-dddd-dddd-dddd-444444444444'::uuid, 'student', null, 'Noah', 'Silva', null, null, null)
on conflict (id) do update
  set role = excluded.role,
      email = excluded.email,
      firstname = excluded.firstname,
      surname = excluded.surname,
      phone = excluded.phone,
      postcode = excluded.postcode,
      partner_program = excluded.partner_program;

insert into public.person_guardian_child (guardian_profile_id, child_profile_id, primary_child)
values
  ('11111111-aaaa-aaaa-aaaa-111111111111'::uuid, '22222222-bbbb-bbbb-bbbb-222222222222'::uuid, true),
  ('33333333-cccc-cccc-cccc-333333333333'::uuid, '44444444-dddd-dddd-dddd-444444444444'::uuid, true)
on conflict (guardian_profile_id, child_profile_id) do update
  set primary_child = excluded.primary_child;
