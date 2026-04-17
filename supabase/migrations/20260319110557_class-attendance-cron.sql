create extension if not exists pg_cron with schema extensions;

do $$
begin
  if exists (
    select 1 from pg_type where typname = 'class_attendance_status' and typnamespace = 'public'::regnamespace
  ) then
    alter type public.class_attendance_status rename to class_attendance_status_old;
    create type public.class_attendance_status as enum ('unknown', 'present', 'absent');

    alter table public.class_attendance alter column status drop default;
    alter table public.class_attendance alter column status drop not null;
    alter table public.class_attendance
      alter column status type public.class_attendance_status
      using (
        case
          when status::text = 'excused' then 'unknown'
          else coalesce(status::text, 'unknown')
        end
      )::public.class_attendance_status;

    drop type public.class_attendance_status_old;
  end if;
end $$;

create or replace function public.ensure_class_attendance_rows()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.class_attendance (class_id, profile_id, status)
  select c.id, we.profile_id, null
  from public.class c
  join public.workshop_enrollment we on we.workshop_id = c.workshop_id
  where c.ends_at < now()
    and we.status = 'approved'
  on conflict (class_id, profile_id) do nothing;
end;
$$;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'class_attendance_hourly') then
    perform cron.schedule(
      'class_attendance_hourly',
      '0 * * * *',
      $cron$select public.ensure_class_attendance_rows();$cron$
    );
  end if;
end $$;
