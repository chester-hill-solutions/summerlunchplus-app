set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.sync_profile_role_from_user_roles()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  existing_role app_role;
begin
  if new.user_id is null then
    return new;
  end if;

  select role into existing_role from public.user_roles where user_id = new.user_id;

  if existing_role is not null then
    new.role := existing_role;
    return new;
  end if;

  if new.role is not null then
    insert into public.user_roles (user_id, role, assigned_by)
    values (new.user_id, new.role, new.user_id)
    on conflict (user_id) do update set role = excluded.role;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_user_role_to_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.profile
  set role = new.role
  where user_id = new.user_id;
  return new;
end;
$function$
;

CREATE TRIGGER on_profile_role_sync BEFORE INSERT OR UPDATE ON public.profile FOR EACH ROW EXECUTE FUNCTION public.sync_profile_role_from_user_roles();

CREATE TRIGGER on_user_roles_sync_profile_role AFTER INSERT OR UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION public.sync_user_role_to_profile();


