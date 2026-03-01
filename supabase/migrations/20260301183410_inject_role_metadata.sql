
set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.handle_new_user_role()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.user_roles (user_id, role, assigned_by)
  values (
    new.id,
    coalesce((new.raw_user_meta_data->>'role')::public.app_role, 'unassigned'),
    new.id
  )
  on conflict (user_id) do nothing;
  return new;
end;
$function$
;
