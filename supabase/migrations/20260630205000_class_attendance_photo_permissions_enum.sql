do $$
begin
  if not exists (
    select 1
    from pg_enum
    where enumtypid = 'public.app_permissions'::regtype
      and enumlabel = 'class_attendance_photo.create'
  ) then
    alter type public.app_permissions add value 'class_attendance_photo.create';
  end if;

  if not exists (
    select 1
    from pg_enum
    where enumtypid = 'public.app_permissions'::regtype
      and enumlabel = 'class_attendance_photo.read'
  ) then
    alter type public.app_permissions add value 'class_attendance_photo.read';
  end if;

  if not exists (
    select 1
    from pg_enum
    where enumtypid = 'public.app_permissions'::regtype
      and enumlabel = 'class_attendance_photo.update'
  ) then
    alter type public.app_permissions add value 'class_attendance_photo.update';
  end if;

  if not exists (
    select 1
    from pg_enum
    where enumtypid = 'public.app_permissions'::regtype
      and enumlabel = 'class_attendance_photo.delete'
  ) then
    alter type public.app_permissions add value 'class_attendance_photo.delete';
  end if;

  if not exists (
    select 1
    from pg_enum
    where enumtypid = 'public.app_permissions'::regtype
      and enumlabel = 'class_attendance_photo_upload_attempt.create'
  ) then
    alter type public.app_permissions add value 'class_attendance_photo_upload_attempt.create';
  end if;

  if not exists (
    select 1
    from pg_enum
    where enumtypid = 'public.app_permissions'::regtype
      and enumlabel = 'class_attendance_photo_upload_attempt.read'
  ) then
    alter type public.app_permissions add value 'class_attendance_photo_upload_attempt.read';
  end if;

  if not exists (
    select 1
    from pg_enum
    where enumtypid = 'public.app_permissions'::regtype
      and enumlabel = 'class_attendance_photo_upload_attempt.update'
  ) then
    alter type public.app_permissions add value 'class_attendance_photo_upload_attempt.update';
  end if;

  if not exists (
    select 1
    from pg_enum
    where enumtypid = 'public.app_permissions'::regtype
      and enumlabel = 'class_attendance_photo_upload_attempt.delete'
  ) then
    alter type public.app_permissions add value 'class_attendance_photo_upload_attempt.delete';
  end if;
end $$;
