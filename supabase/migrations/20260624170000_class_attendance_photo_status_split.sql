do $$
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'class_attendance_photo_status'
      and typnamespace = 'public'::regnamespace
  ) then
    create type public.class_attendance_photo_status as enum ('uploaded', 'accepted', 'rejected');
  end if;
end $$;

alter table public.class_attendance
add column if not exists photo_status public.class_attendance_photo_status;

update public.class_attendance
set
  photo_status = status::text::public.class_attendance_photo_status,
  status = 'present'::public.class_attendance_status
where status::text in ('uploaded', 'accepted', 'rejected');

do $$
begin
  alter type public.class_attendance_status rename to class_attendance_status_old;

  create type public.class_attendance_status as enum ('unknown', 'present', 'absent');

  alter table public.class_attendance
    alter column status type public.class_attendance_status
    using (
      case
        when status::text in ('uploaded', 'accepted', 'rejected') then 'present'
        else coalesce(status::text, 'unknown')
      end
    )::public.class_attendance_status;

  drop type public.class_attendance_status_old;
end $$;

grant usage on type public.class_attendance_status to authenticated, supabase_auth_admin;
grant usage on type public.class_attendance_photo_status to authenticated, supabase_auth_admin;
