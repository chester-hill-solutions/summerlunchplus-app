-- Sample gift card uploads and assets tied to the existing prior semester seed.

insert into public.workshop_enrollment (workshop_id, semester_id, profile_id, status)
values
  ('11111111-1111-1111-1111-111111111111'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, '22222222-bbbb-bbbb-bbbb-222222222222'::uuid, 'approved'),
  ('11111111-1111-1111-1111-111111111111'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, '44444444-dddd-dddd-dddd-444444444444'::uuid, 'approved')
on conflict (semester_id, profile_id) do update
  set status = excluded.status;

insert into public.class_attendance (class_id, profile_id, status)
values
  ('aaaaaaaa-1111-1111-1111-aaaaaaaa1111'::uuid, '22222222-bbbb-bbbb-bbbb-222222222222'::uuid, 'present'),
  ('aaaaaaaa-1111-1111-1111-aaaaaaaa1111'::uuid, '44444444-dddd-dddd-dddd-444444444444'::uuid, 'present')
on conflict (class_id, profile_id) do update
  set status = excluded.status;

with upload_batch as (
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
    '44444444-dddd-dddd-dddd-444444444444'::uuid,
    40.00,
    'https://example.com/gift-card/bravo',
    'used',
    now() - interval '6 months',
    now() - interval '5 months',
    '{"source":"seed"}'::jsonb
  )
on conflict do nothing;
