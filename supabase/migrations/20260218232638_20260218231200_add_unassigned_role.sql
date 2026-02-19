revoke delete on table "public"."user_roles" from "anon";

revoke insert on table "public"."user_roles" from "anon";

revoke references on table "public"."user_roles" from "anon";

revoke select on table "public"."user_roles" from "anon";

revoke trigger on table "public"."user_roles" from "anon";

revoke truncate on table "public"."user_roles" from "anon";

revoke update on table "public"."user_roles" from "anon";

alter table "public"."user_roles" alter column "role" drop default;

alter type "public"."app_role" rename to "app_role__old_version_to_be_dropped";

create type "public"."app_role" as enum ('unassigned', 'admin', 'manager', 'staff', 'instructor', 'student', 'parent');

alter table "public"."user_roles" alter column role type "public"."app_role" using role::text::"public"."app_role";

alter table "public"."user_roles" alter column "role" set default 'student'::public.app_role;

drop type "public"."app_role__old_version_to_be_dropped";

alter table "public"."user_roles" alter column "role" set default 'unassigned'::public.app_role;

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  declare
    claims jsonb;
    user_role app_role;
  begin
    select role into user_role from public.user_roles where user_id = (event->>'user_id')::uuid;
    claims := coalesce(event->'claims', '{}'::jsonb);
    claims := jsonb_set(
      claims,
      '{user_role}',
      to_jsonb(coalesce(user_role, 'unassigned'::app_role))
    );
    event := jsonb_set(event, '{claims}', claims);
    return event;
  end;
$function$
;


