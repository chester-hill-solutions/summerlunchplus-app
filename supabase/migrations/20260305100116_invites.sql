create type "public"."invite_status" as enum ('pending', 'confirmed', 'revoked');

revoke delete on table "public"."class" from "anon";

revoke insert on table "public"."class" from "anon";

revoke references on table "public"."class" from "anon";

revoke select on table "public"."class" from "anon";

revoke trigger on table "public"."class" from "anon";

revoke truncate on table "public"."class" from "anon";

revoke update on table "public"."class" from "anon";

revoke delete on table "public"."class_enrollment" from "anon";

revoke insert on table "public"."class_enrollment" from "anon";

revoke references on table "public"."class_enrollment" from "anon";

revoke select on table "public"."class_enrollment" from "anon";

revoke trigger on table "public"."class_enrollment" from "anon";

revoke truncate on table "public"."class_enrollment" from "anon";

revoke update on table "public"."class_enrollment" from "anon";

revoke delete on table "public"."form" from "anon";

revoke insert on table "public"."form" from "anon";

revoke references on table "public"."form" from "anon";

revoke select on table "public"."form" from "anon";

revoke trigger on table "public"."form" from "anon";

revoke truncate on table "public"."form" from "anon";

revoke update on table "public"."form" from "anon";

revoke delete on table "public"."form_answer" from "anon";

revoke insert on table "public"."form_answer" from "anon";

revoke references on table "public"."form_answer" from "anon";

revoke select on table "public"."form_answer" from "anon";

revoke trigger on table "public"."form_answer" from "anon";

revoke truncate on table "public"."form_answer" from "anon";

revoke update on table "public"."form_answer" from "anon";

revoke delete on table "public"."form_assignment" from "anon";

revoke insert on table "public"."form_assignment" from "anon";

revoke references on table "public"."form_assignment" from "anon";

revoke select on table "public"."form_assignment" from "anon";

revoke trigger on table "public"."form_assignment" from "anon";

revoke truncate on table "public"."form_assignment" from "anon";

revoke update on table "public"."form_assignment" from "anon";

revoke delete on table "public"."form_question" from "anon";

revoke insert on table "public"."form_question" from "anon";

revoke references on table "public"."form_question" from "anon";

revoke select on table "public"."form_question" from "anon";

revoke trigger on table "public"."form_question" from "anon";

revoke truncate on table "public"."form_question" from "anon";

revoke update on table "public"."form_question" from "anon";

revoke delete on table "public"."form_submission" from "anon";

revoke insert on table "public"."form_submission" from "anon";

revoke references on table "public"."form_submission" from "anon";

revoke select on table "public"."form_submission" from "anon";

revoke trigger on table "public"."form_submission" from "anon";

revoke truncate on table "public"."form_submission" from "anon";

revoke update on table "public"."form_submission" from "anon";

revoke delete on table "public"."profiles" from "anon";

revoke insert on table "public"."profiles" from "anon";

revoke references on table "public"."profiles" from "anon";

revoke select on table "public"."profiles" from "anon";

revoke trigger on table "public"."profiles" from "anon";

revoke truncate on table "public"."profiles" from "anon";

revoke update on table "public"."profiles" from "anon";

revoke delete on table "public"."profiles" from "authenticated";

revoke insert on table "public"."profiles" from "authenticated";

revoke references on table "public"."profiles" from "authenticated";

revoke trigger on table "public"."profiles" from "authenticated";

revoke truncate on table "public"."profiles" from "authenticated";

revoke delete on table "public"."role_permission" from "anon";

revoke insert on table "public"."role_permission" from "anon";

revoke references on table "public"."role_permission" from "anon";

revoke select on table "public"."role_permission" from "anon";

revoke trigger on table "public"."role_permission" from "anon";

revoke truncate on table "public"."role_permission" from "anon";

revoke update on table "public"."role_permission" from "anon";

revoke delete on table "public"."session" from "anon";

revoke insert on table "public"."session" from "anon";

revoke references on table "public"."session" from "anon";

revoke select on table "public"."session" from "anon";

revoke trigger on table "public"."session" from "anon";

revoke truncate on table "public"."session" from "anon";

revoke update on table "public"."session" from "anon";

revoke delete on table "public"."user_roles" from "anon";

revoke insert on table "public"."user_roles" from "anon";

revoke references on table "public"."user_roles" from "anon";

revoke select on table "public"."user_roles" from "anon";

revoke trigger on table "public"."user_roles" from "anon";

revoke truncate on table "public"."user_roles" from "anon";

revoke update on table "public"."user_roles" from "anon";


  create table "public"."invites" (
    "id" uuid not null default gen_random_uuid(),
    "inviter_user_id" uuid not null,
    "invitee_user_id" uuid,
    "invitee_email" text not null,
    "role" public.app_role not null,
    "status" public.invite_status not null default 'pending'::public.invite_status,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now(),
    "confirmed_at" timestamp with time zone
      );


alter table "public"."person" add column "password_set" boolean not null default false;

CREATE UNIQUE INDEX invites_pkey ON public.invites USING btree (id);

alter table "public"."invites" add constraint "invites_pkey" PRIMARY KEY using index "invites_pkey";

alter table "public"."invites" add constraint "invites_invitee_user_id_fkey" FOREIGN KEY (invitee_user_id) REFERENCES auth.users(id) ON DELETE SET NULL not valid;

alter table "public"."invites" validate constraint "invites_invitee_user_id_fkey";

alter table "public"."invites" add constraint "invites_inviter_user_id_fkey" FOREIGN KEY (inviter_user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."invites" validate constraint "invites_inviter_user_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.authorize(requested_permission public.app_permissions)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  bind_permissions int;
  user_role public.app_role;
begin
  select coalesce(
    nullif((current_setting('request.jwt.claims', true)::jsonb ->> 'user_role'), '')::public.app_role,
    'unassigned'::public.app_role
  ) into user_role;

  if (user_role = 'admin') then
    return true;
  end if;

  select count(*)
    into bind_permissions
    from public.role_permission
    where role_permission.permission = requested_permission
      and role_permission.role = user_role;

  return bind_permissions > 0;
end;
$function$
;

grant delete on table "public"."invites" to "anon";

grant insert on table "public"."invites" to "anon";

grant references on table "public"."invites" to "anon";

grant select on table "public"."invites" to "anon";

grant trigger on table "public"."invites" to "anon";

grant truncate on table "public"."invites" to "anon";

grant update on table "public"."invites" to "anon";

grant delete on table "public"."invites" to "authenticated";

grant insert on table "public"."invites" to "authenticated";

grant references on table "public"."invites" to "authenticated";

grant select on table "public"."invites" to "authenticated";

grant trigger on table "public"."invites" to "authenticated";

grant truncate on table "public"."invites" to "authenticated";

grant update on table "public"."invites" to "authenticated";

grant delete on table "public"."invites" to "service_role";

grant insert on table "public"."invites" to "service_role";

grant references on table "public"."invites" to "service_role";

grant select on table "public"."invites" to "service_role";

grant trigger on table "public"."invites" to "service_role";

grant truncate on table "public"."invites" to "service_role";

grant update on table "public"."invites" to "service_role";


