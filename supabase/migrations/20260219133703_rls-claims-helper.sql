drop policy "form_admin_manage" on "public"."form";

drop policy "form_answer_admin_manage" on "public"."form_answer";

drop policy "form_assignment_admin_manage" on "public"."form_assignment";

drop policy "form_question_admin_manage" on "public"."form_question";

drop policy "form_submission_admin_manage" on "public"."form_submission";

drop policy "form_assignment_self_insert" on "public"."form_assignment";

drop policy "role_permission_admin_manage" on "public"."role_permission";

drop policy "user_roles_write_admin" on "public"."user_roles";

alter type "public"."app_permissions" rename to "app_permissions__old_version_to_be_dropped";

create type "public"."app_permissions" as enum ('site.read', 'form.create', 'form.read', 'form.update', 'form.delete', 'form_question.create', 'form_question.read', 'form_question.update', 'form_question.delete', 'form_assignment.create', 'form_assignment.read', 'form_assignment.update', 'form_assignment.delete', 'form_submission.create', 'form_submission.read', 'form_submission.update', 'form_submission.delete', 'form_answer.create', 'form_answer.read', 'form_answer.update', 'form_answer.delete', 'user_roles.manage', 'role_permission.manage', 'profiles.read', 'profiles.update');

alter table "public"."role_permission" alter column permission type "public"."app_permissions" using permission::text::"public"."app_permissions";

drop type "public"."app_permissions__old_version_to_be_dropped";

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

  select count(*)
    into bind_permissions
    from public.role_permission
    where role_permission.permission = requested_permission
      and role_permission.role = user_role;

  return bind_permissions > 0;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.current_user_role()
 RETURNS public.app_role
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(
    nullif((current_setting('request.jwt.claims', true)::jsonb ->> 'user_role'), '')::app_role,
    'unassigned'::app_role
  );
$function$
;


  create policy "form_delete_authorized"
  on "public"."form"
  as permissive
  for delete
  to public
using (public.authorize('form.delete'::public.app_permissions));



  create policy "form_insert_authorized"
  on "public"."form"
  as permissive
  for insert
  to public
with check (public.authorize('form.create'::public.app_permissions));



  create policy "form_select_authorized"
  on "public"."form"
  as permissive
  for select
  to public
using (public.authorize('form.read'::public.app_permissions));



  create policy "form_update_authorized"
  on "public"."form"
  as permissive
  for update
  to public
using (public.authorize('form.update'::public.app_permissions))
with check (public.authorize('form.update'::public.app_permissions));



  create policy "form_answer_delete_authorized"
  on "public"."form_answer"
  as permissive
  for delete
  to public
using (public.authorize('form_answer.delete'::public.app_permissions));



  create policy "form_answer_insert_authorized"
  on "public"."form_answer"
  as permissive
  for insert
  to public
with check (public.authorize('form_answer.create'::public.app_permissions));



  create policy "form_answer_select_authorized"
  on "public"."form_answer"
  as permissive
  for select
  to public
using (public.authorize('form_answer.read'::public.app_permissions));



  create policy "form_answer_update_authorized"
  on "public"."form_answer"
  as permissive
  for update
  to public
using (public.authorize('form_answer.update'::public.app_permissions))
with check (public.authorize('form_answer.update'::public.app_permissions));



  create policy "form_assignment_delete_authorized"
  on "public"."form_assignment"
  as permissive
  for delete
  to public
using (public.authorize('form_assignment.delete'::public.app_permissions));



  create policy "form_assignment_insert_authorized"
  on "public"."form_assignment"
  as permissive
  for insert
  to public
with check (public.authorize('form_assignment.create'::public.app_permissions));



  create policy "form_assignment_select_authorized"
  on "public"."form_assignment"
  as permissive
  for select
  to public
using (public.authorize('form_assignment.read'::public.app_permissions));



  create policy "form_assignment_update_authorized"
  on "public"."form_assignment"
  as permissive
  for update
  to public
using (public.authorize('form_assignment.update'::public.app_permissions))
with check (public.authorize('form_assignment.update'::public.app_permissions));



  create policy "form_question_delete_authorized"
  on "public"."form_question"
  as permissive
  for delete
  to public
using (public.authorize('form_question.delete'::public.app_permissions));



  create policy "form_question_insert_authorized"
  on "public"."form_question"
  as permissive
  for insert
  to public
with check (public.authorize('form_question.create'::public.app_permissions));



  create policy "form_question_select_authorized"
  on "public"."form_question"
  as permissive
  for select
  to public
using (public.authorize('form_question.read'::public.app_permissions));



  create policy "form_question_update_authorized"
  on "public"."form_question"
  as permissive
  for update
  to public
using (public.authorize('form_question.update'::public.app_permissions))
with check (public.authorize('form_question.update'::public.app_permissions));



  create policy "form_submission_delete_authorized"
  on "public"."form_submission"
  as permissive
  for delete
  to public
using (public.authorize('form_submission.delete'::public.app_permissions));



  create policy "form_submission_insert_authorized"
  on "public"."form_submission"
  as permissive
  for insert
  to public
with check (public.authorize('form_submission.create'::public.app_permissions));



  create policy "form_submission_select_authorized"
  on "public"."form_submission"
  as permissive
  for select
  to public
using (public.authorize('form_submission.read'::public.app_permissions));



  create policy "form_submission_update_authorized"
  on "public"."form_submission"
  as permissive
  for update
  to public
using (public.authorize('form_submission.update'::public.app_permissions))
with check (public.authorize('form_submission.update'::public.app_permissions));



  create policy "form_assignment_self_insert"
  on "public"."form_assignment"
  as permissive
  for insert
  to public
with check (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.form f
  WHERE ((f.id = form_assignment.form_id) AND (public.current_user_role() = ANY (f.auto_assign)))))));



  create policy "role_permission_admin_manage"
  on "public"."role_permission"
  as permissive
  for all
  to public
using (public.authorize('role_permission.manage'::public.app_permissions))
with check (public.authorize('role_permission.manage'::public.app_permissions));



  create policy "user_roles_write_admin"
  on "public"."user_roles"
  as permissive
  for all
  to public
using (public.authorize('user_roles.manage'::public.app_permissions))
with check (public.authorize('user_roles.manage'::public.app_permissions));



