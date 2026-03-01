-- Seed a sample class section and scheduled classes for local dev.
with section as (
  insert into public.class_section (
    id, description, enrollment_open_at, enrollment_close_at, capacity, wait_list_capacity
  )
  values (
    '11111111-1111-1111-1111-111111111111'::uuid,
    'Partner program class section for summer launch',
    now(),
    now() + interval '6 weeks',
    30,
    10
  )
  on conflict (id) do update
    set description = excluded.description,
        enrollment_open_at = excluded.enrollment_open_at,
        enrollment_close_at = excluded.enrollment_close_at,
        capacity = excluded.capacity,
        wait_list_capacity = excluded.wait_list_capacity
  returning id
)
insert into public.class (id, class_section_id, starts_at, ends_at, location)
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
    class_section_id = excluded.class_section_id,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    location = excluded.location;
