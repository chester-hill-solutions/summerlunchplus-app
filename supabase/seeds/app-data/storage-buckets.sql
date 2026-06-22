insert into storage.buckets (id, name, public)
values
  ('gift-cards-raw', 'gift-cards-raw', false),
  ('gift-cards-processed', 'gift-cards-processed', false),
  ('manage-exports', 'manage-exports', false)
on conflict (id) do nothing;

drop policy if exists storage_gift_cards_staff_read on storage.objects;
drop policy if exists storage_gift_cards_staff_write on storage.objects;
drop policy if exists storage_gift_cards_staff_update on storage.objects;
drop policy if exists storage_gift_cards_staff_delete on storage.objects;
drop policy if exists storage_manage_exports_staff_read on storage.objects;
drop policy if exists storage_manage_exports_staff_write on storage.objects;
drop policy if exists storage_manage_exports_staff_update on storage.objects;
drop policy if exists storage_manage_exports_staff_delete on storage.objects;

create policy storage_gift_cards_staff_read
  on storage.objects
  for select
  using (
    bucket_id in ('gift-cards-raw', 'gift-cards-processed')
    and public.current_user_role() in ('admin', 'manager', 'staff')
  );

create policy storage_gift_cards_staff_write
  on storage.objects
  for insert
  with check (
    bucket_id in ('gift-cards-raw', 'gift-cards-processed')
    and public.current_user_role() in ('admin', 'manager', 'staff')
  );

create policy storage_gift_cards_staff_update
  on storage.objects
  for update
  using (
    bucket_id in ('gift-cards-raw', 'gift-cards-processed')
    and public.current_user_role() in ('admin', 'manager', 'staff')
  )
  with check (
    bucket_id in ('gift-cards-raw', 'gift-cards-processed')
    and public.current_user_role() in ('admin', 'manager', 'staff')
  );

create policy storage_gift_cards_staff_delete
  on storage.objects
  for delete
  using (
    bucket_id in ('gift-cards-raw', 'gift-cards-processed')
    and public.current_user_role() in ('admin', 'manager', 'staff')
  );

create policy storage_manage_exports_staff_read
  on storage.objects
  for select
  using (
    bucket_id = 'manage-exports'
    and public.current_user_role() in ('admin', 'manager', 'staff')
  );

create policy storage_manage_exports_staff_write
  on storage.objects
  for insert
  with check (
    bucket_id = 'manage-exports'
    and public.current_user_role() in ('admin', 'manager', 'staff')
  );

create policy storage_manage_exports_staff_update
  on storage.objects
  for update
  using (
    bucket_id = 'manage-exports'
    and public.current_user_role() in ('admin', 'manager', 'staff')
  )
  with check (
    bucket_id = 'manage-exports'
    and public.current_user_role() in ('admin', 'manager', 'staff')
  );

create policy storage_manage_exports_staff_delete
  on storage.objects
  for delete
  using (
    bucket_id = 'manage-exports'
    and public.current_user_role() in ('admin', 'manager', 'staff')
  );
