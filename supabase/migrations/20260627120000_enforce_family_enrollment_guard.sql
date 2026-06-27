-- Enforce cap/waitlist guardrails for family self-enrollment path.
-- Staff status updates remain intentionally unrestricted.

drop function if exists public.request_family_workshop_enrollment(uuid, uuid, uuid[], uuid);

create or replace function public.request_family_workshop_enrollment(
  p_workshop_id uuid,
  p_profile_id uuid,
  p_family_profile_ids uuid[]
)
returns table (
  ok boolean,
  enrollment_id uuid,
  enrollment_status public.workshop_enrollment_status,
  error_code text,
  error_message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workshop public.workshop%rowtype;
  v_now timestamptz := now();
  v_existing_enrollment_id uuid;
  v_approved_count integer;
  v_waitlisted_count integer;
  v_status public.workshop_enrollment_status;
  v_inserted_id uuid;
begin
  if p_workshop_id is null or p_profile_id is null then
    return query
      select false, null::uuid, null::public.workshop_enrollment_status, 'invalid_input', 'Missing workshop or profile id';
    return;
  end if;

  select *
  into v_workshop
  from public.workshop
  where id = p_workshop_id
  for update;

  if not found then
    return query
      select false, null::uuid, null::public.workshop_enrollment_status, 'workshop_not_found', 'Workshop not found';
    return;
  end if;

  if (
    (v_workshop.enrollment_open_at is not null and v_now < v_workshop.enrollment_open_at)
    or (v_workshop.enrollment_close_at is not null and v_now > v_workshop.enrollment_close_at)
  ) then
    return query
      select false, null::uuid, null::public.workshop_enrollment_status, 'enrollment_closed', 'Enrollment is closed for this workshop';
    return;
  end if;

  select we.id
  into v_existing_enrollment_id
  from public.workshop_enrollment we
  where we.semester_id = v_workshop.semester_id
    and we.profile_id = any(coalesce(p_family_profile_ids, array[]::uuid[]))
  limit 1;

  if v_existing_enrollment_id is not null then
    return query
      select false, null::uuid, null::public.workshop_enrollment_status, 'family_already_enrolled', 'Your family is already enrolled in one workshop for this semester.';
    return;
  end if;

  select count(*)::integer
  into v_approved_count
  from public.workshop_enrollment
  where workshop_id = p_workshop_id
    and status = 'approved';

  select count(*)::integer
  into v_waitlisted_count
  from public.workshop_enrollment
  where workshop_id = p_workshop_id
    and status = 'waitlisted';

  if v_approved_count < greatest(coalesce(v_workshop.capacity, 0), 0) then
    v_status := 'pending';
  elsif v_waitlisted_count < greatest(coalesce(v_workshop.wait_list_capacity, 0), 0) then
    v_status := 'waitlisted';
  else
    return query
      select false, null::uuid, null::public.workshop_enrollment_status, 'workshop_full', 'This workshop and its waitlist are full';
    return;
  end if;

  insert into public.workshop_enrollment (workshop_id, profile_id, status)
  values (p_workshop_id, p_profile_id, v_status)
  returning id into v_inserted_id;

  return query select true, v_inserted_id, v_status, null::text, null::text;
end;
$$;

revoke all on function public.request_family_workshop_enrollment(uuid, uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.request_family_workshop_enrollment(uuid, uuid, uuid[]) to service_role, supabase_auth_admin;
