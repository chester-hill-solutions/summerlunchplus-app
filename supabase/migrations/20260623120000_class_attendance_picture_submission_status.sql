do $$
begin
  if not exists (
    select 1
    from pg_enum
    where enumtypid = 'public.class_attendance_status'::regtype
      and enumlabel = 'uploaded'
  ) then
    alter type public.class_attendance_status add value 'uploaded';
  end if;

  if not exists (
    select 1
    from pg_enum
    where enumtypid = 'public.class_attendance_status'::regtype
      and enumlabel = 'accepted'
  ) then
    alter type public.class_attendance_status add value 'accepted';
  end if;
end $$;
