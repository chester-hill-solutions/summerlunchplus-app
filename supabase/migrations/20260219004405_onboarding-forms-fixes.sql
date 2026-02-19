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

revoke delete on table "public"."role_permission" from "anon";

revoke insert on table "public"."role_permission" from "anon";

revoke references on table "public"."role_permission" from "anon";

revoke select on table "public"."role_permission" from "anon";

revoke trigger on table "public"."role_permission" from "anon";

revoke truncate on table "public"."role_permission" from "anon";

revoke update on table "public"."role_permission" from "anon";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.sync_auto_assigned_forms_for_form(p_form_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.form_assignment (form_id, user_id, assigned_by)
  select f.id, ur.user_id, null
  from public.form f
  join public.user_roles ur on ur.role = any (f.auto_assign)
  where f.id = p_form_id
  on conflict (form_id, user_id) do nothing;

  delete from public.form_assignment fa
  where fa.form_id = p_form_id
    and not exists (
      select 1
      from public.form f
      join public.user_roles ur on ur.user_id = fa.user_id
      where f.id = fa.form_id
        and ur.role = any (f.auto_assign)
    )
    and not exists (
      select 1 from public.form_submission fs
      where fs.form_id = fa.form_id
        and fs.user_id = fa.user_id
    );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.sync_auto_assigned_forms_for_user(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  user_role app_role;
begin
  select role into user_role from public.user_roles where user_id = p_user_id;
  user_role := coalesce(user_role, 'unassigned'::app_role);

  insert into public.form_assignment (form_id, user_id, assigned_by)
  select f.id, p_user_id, null
  from public.form f
  where user_role = any (f.auto_assign)
  on conflict (form_id, user_id) do nothing;

  delete from public.form_assignment fa
  where fa.user_id = p_user_id
    and fa.form_id in (
      select f.id
      from public.form f
      where not (user_role = any (f.auto_assign))
    )
    and not exists (
      select 1 from public.form_submission fs
      where fs.form_id = fa.form_id
        and fs.user_id = fa.user_id
    );
end;
$function$
;


