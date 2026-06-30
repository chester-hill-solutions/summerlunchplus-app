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
  where c.starts_at <= now() + interval '36 hours'
    and we.status = 'approved'
  on conflict (class_id, profile_id) do nothing;
end;
$$;
