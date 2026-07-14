do $$
begin
  if not exists (
    select 1
    from pg_enum
    where enumtypid = 'public.class_attendance_photo_status'::regtype
      and enumlabel = 'expired'
  ) then
    alter type public.class_attendance_photo_status add value 'expired';
  end if;
end $$;
