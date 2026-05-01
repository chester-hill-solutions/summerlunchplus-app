-- Sample gift card uploads and assets tied to last year's attendance.
with last_year_semester as (
  insert into public.semester (id, starts_at, ends_at, enrollment_open_at, enrollment_close_at)
  values (
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'::uuid,
    '2025-06-03T00:00:00Z',
    '2025-08-30T23:59:59Z',
    '2025-02-01T00:00:00Z',
    '2025-05-15T23:59:59Z'
  )
  on conflict (id) do update
    set starts_at = excluded.starts_at,
        ends_at = excluded.ends_at,
        enrollment_open_at = excluded.enrollment_open_at,
        enrollment_close_at = excluded.enrollment_close_at
  returning id
), last_year_workshop as (
  insert into public.workshop (id, semester_id, description, enrollment_open_at, enrollment_close_at, capacity, wait_list_capacity)
  values (
    'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid,
    (select id from last_year_semester),
    '2025 Summer Workshop - Sample',
    '2025-02-01T00:00:00Z',
    '2025-05-15T23:59:59Z',
    5,
    2
  )
  on conflict (id) do update
    set semester_id = excluded.semester_id,
        description = excluded.description,
        enrollment_open_at = excluded.enrollment_open_at,
        enrollment_close_at = excluded.enrollment_close_at,
        capacity = excluded.capacity,
        wait_list_capacity = excluded.wait_list_capacity
  returning id
), last_year_class as (
  insert into public.class (id, workshop_id, starts_at, ends_at, location)
  values (
    '11111111-ffff-ffff-ffff-111111111111'::uuid,
    (select id from last_year_workshop),
    '2025-06-10T16:00:00Z',
    '2025-06-10T17:30:00Z',
    'Community Kitchen'
  )
  on conflict (id) do update
    set workshop_id = excluded.workshop_id,
        starts_at = excluded.starts_at,
        ends_at = excluded.ends_at,
        location = excluded.location
  returning id
), enrollments as (
  insert into public.workshop_enrollment (workshop_id, semester_id, profile_id, status)
  values
    ((select id from last_year_workshop), (select id from last_year_semester), '22222222-bbbb-bbbb-bbbb-222222222222'::uuid, 'approved'),
    ((select id from last_year_workshop), (select id from last_year_semester), '33333333-bbbb-bbbb-bbbb-333333333333'::uuid, 'approved')
  on conflict (semester_id, profile_id) do update
    set status = excluded.status
  returning id
), attendance as (
  insert into public.class_attendance (class_id, profile_id, status)
  values
    ((select id from last_year_class), '22222222-bbbb-bbbb-bbbb-222222222222'::uuid, 'present'),
    ((select id from last_year_class), '33333333-bbbb-bbbb-bbbb-333333333333'::uuid, 'present')
  on conflict (class_id, profile_id) do update
    set status = excluded.status
  returning id
), upload_batch as (
  insert into public.gift_card_upload (
    id, uploaded_by, provider, upload_type, status, file_name, file_size, total_cards, processed_cards
  )
  values (
    'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'::uuid,
    null,
    'Sample Provider',
    'csv_link',
    'processed',
    'sample-gift-cards.csv',
    1024,
    2,
    2
  )
  on conflict (id) do update
    set provider = excluded.provider,
        upload_type = excluded.upload_type,
        status = excluded.status,
        file_name = excluded.file_name,
        file_size = excluded.file_size,
        total_cards = excluded.total_cards,
        processed_cards = excluded.processed_cards
  returning id
)
insert into public.gift_card_asset (
  upload_id,
  assigned_profile_id,
  value,
  asset_url,
  status,
  sent_at,
  used_at,
  metadata
)
values
  (
    (select id from upload_batch),
    '22222222-bbbb-bbbb-bbbb-222222222222'::uuid,
    40.00,
    'https://example.com/gift-card/alpha',
    'sent',
    now() - interval '6 months',
    null,
    '{"source":"seed"}'::jsonb
  ),
  (
    (select id from upload_batch),
    '33333333-bbbb-bbbb-bbbb-333333333333'::uuid,
    40.00,
    'https://example.com/gift-card/bravo',
    'used',
    now() - interval '6 months',
    now() - interval '5 months',
    '{"source":"seed"}'::jsonb
  )
on conflict do nothing;
