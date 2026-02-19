set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.mark_assignment_submitted()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  raise notice '[mark_assignment_submitted] enter form % user %', new.form_id, new.user_id;
  update public.form_assignment
  set status = 'submitted'
  where form_id = new.form_id
    and user_id = new.user_id;
  raise notice '[mark_assignment_submitted] updated assignment to submitted';
  return new;
end;
$function$
;


