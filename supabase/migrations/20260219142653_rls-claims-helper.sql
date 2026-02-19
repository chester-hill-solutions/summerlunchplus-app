set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.promote_user_after_submission()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  current_role app_role;
  has_completed boolean;
begin
  if not public.should_auto_promote_onboarding() then
    return new;
  end if;

  select role into current_role from public.user_roles where user_id = new.user_id;
  if current_role is distinct from 'unassigned' then
    raise notice '[promote_user_after_submission] skip: role is % for user %', current_role, new.user_id;
    return new;
  end if;

  select coalesce(public.has_completed_required_forms(new.user_id), false) into has_completed;
  raise notice '[promote_user_after_submission] eval user %, current_role %, has_completed %', new.user_id, current_role, has_completed;

  if has_completed then
    update public.user_roles
    set role = 'student'
    where user_id = new.user_id;
    raise notice '[promote_user_after_submission] promoted user % to student', new.user_id;
  end if;

  return new;
end;
$function$
;


