set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.has_completed_required_forms(p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  required_count int := 0;
  incomplete_count int := 0;
  result boolean := false;
begin
  select count(*)
    into required_count
    from public.form_assignment fa
    join public.form f on f.id = fa.form_id
    where fa.user_id = p_user_id
      and f.is_required = true;

  if required_count = 0 then
    result := false;
    raise log '[has_completed_required_forms] no required assignments for user %', p_user_id;
    return result;
  end if;

  select count(*)
    into incomplete_count
    from public.form_assignment fa
    join public.form f on f.id = fa.form_id
    where fa.user_id = p_user_id
      and f.is_required = true
      and coalesce(fa.status, 'pending') is distinct from 'submitted';

  result := (incomplete_count = 0);
  raise log '[has_completed_required_forms] user % required_count %, incomplete_count %, result %',
    p_user_id, required_count, incomplete_count, result;

  return result;
end;
$function$
;


