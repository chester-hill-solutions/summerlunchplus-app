set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.has_completed_required_forms(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with required_assignments as (
    select fa.form_id, fa.status
    from public.form_assignment fa
    join public.form f on f.id = fa.form_id
    where fa.user_id = p_user_id
      and f.is_required = true
  )
  select case
    when not exists (select 1 from required_assignments) then false
    when exists (
      select 1 from required_assignments ra
      where ra.status is distinct from 'submitted'
    ) then false
    else true
  end;
$function$
;


