set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.promote_user_after_submission()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  user_role_current app_role;
  has_completed boolean;
begin
  raise log '[promote_user_after_submission] enter user % form %', new.user_id, new.form_id;

  if not public.should_auto_promote_onboarding() then
    raise log '[promote_user_after_submission] skip: onboarding_mode=permission for user %', new.user_id;
    return new;
  end if;

  -- Mark assignment submitted first so completion check sees latest status.
  update public.form_assignment
  set status = 'submitted'
  where form_id = new.form_id
    and user_id = new.user_id;

  select coalesce(role, 'unassigned'::app_role)
    into user_role_current
    from public.user_roles
    where user_id = new.user_id;

  if user_role_current is distinct from 'unassigned' then
    raise log '[promote_user_after_submission] skip: role is % for user %', user_role_current, new.user_id;
    return new;
  end if;

  select coalesce(public.has_completed_required_forms(new.user_id), false) into has_completed;
  raise log '[promote_user_after_submission] eval user %, current_role %, has_completed %', new.user_id, user_role_current, has_completed;

  if has_completed then
    update public.user_roles
    set role = 'student'
    where user_id = new.user_id;
    raise log '[promote_user_after_submission] promoted user % to student', new.user_id;
  end if;

  return new;
end;
$function$
;


