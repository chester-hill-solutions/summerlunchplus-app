revoke delete on table "public"."class_attendance" from "anon";

revoke insert on table "public"."class_attendance" from "anon";

revoke references on table "public"."class_attendance" from "anon";

revoke select on table "public"."class_attendance" from "anon";

revoke trigger on table "public"."class_attendance" from "anon";

revoke truncate on table "public"."class_attendance" from "anon";

revoke update on table "public"."class_attendance" from "anon";

revoke delete on table "public"."form_question_map" from "anon";

revoke insert on table "public"."form_question_map" from "anon";

revoke references on table "public"."form_question_map" from "anon";

revoke select on table "public"."form_question_map" from "anon";

revoke trigger on table "public"."form_question_map" from "anon";

revoke truncate on table "public"."form_question_map" from "anon";

revoke update on table "public"."form_question_map" from "anon";

revoke delete on table "public"."person_guardian_child" from "anon";

revoke insert on table "public"."person_guardian_child" from "anon";

revoke references on table "public"."person_guardian_child" from "anon";

revoke select on table "public"."person_guardian_child" from "anon";

revoke trigger on table "public"."person_guardian_child" from "anon";

revoke truncate on table "public"."person_guardian_child" from "anon";

revoke update on table "public"."person_guardian_child" from "anon";

revoke delete on table "public"."person_guardian_child" from "authenticated";

revoke references on table "public"."person_guardian_child" from "authenticated";

revoke trigger on table "public"."person_guardian_child" from "authenticated";

revoke truncate on table "public"."person_guardian_child" from "authenticated";

revoke delete on table "public"."profile" from "anon";

revoke insert on table "public"."profile" from "anon";

revoke references on table "public"."profile" from "anon";

revoke select on table "public"."profile" from "anon";

revoke trigger on table "public"."profile" from "anon";

revoke truncate on table "public"."profile" from "anon";

revoke update on table "public"."profile" from "anon";

revoke delete on table "public"."profile" from "authenticated";

revoke references on table "public"."profile" from "authenticated";

revoke trigger on table "public"."profile" from "authenticated";

revoke truncate on table "public"."profile" from "authenticated";

revoke delete on table "public"."semester" from "anon";

revoke insert on table "public"."semester" from "anon";

revoke references on table "public"."semester" from "anon";

revoke select on table "public"."semester" from "anon";

revoke trigger on table "public"."semester" from "anon";

revoke truncate on table "public"."semester" from "anon";

revoke update on table "public"."semester" from "anon";

alter table "public"."class" drop constraint "session_check";

alter table "public"."class" drop constraint "session_workshop_id_fkey";

alter table "public"."class_attendance" drop constraint "session_attendance_profile_id_fkey";

alter table "public"."class_attendance" drop constraint "session_attendance_recorded_by_fkey";

alter table "public"."class_attendance" drop constraint "session_attendance_session_id_fkey";

alter table "public"."class_attendance" drop constraint "session_attendance_session_id_profile_id_key";

alter table "public"."class" drop constraint "session_pkey";

alter table "public"."class_attendance" drop constraint "session_attendance_pkey";

drop index if exists "public"."session_attendance_pkey";

drop index if exists "public"."session_attendance_session_id_profile_id_key";

drop index if exists "public"."session_pkey";

alter table "public"."sign_up_flow" alter column "roles" drop default;

CREATE UNIQUE INDEX class_attendance_class_id_profile_id_key ON public.class_attendance USING btree (class_id, profile_id);

CREATE UNIQUE INDEX class_attendance_pkey ON public.class_attendance USING btree (id);

CREATE UNIQUE INDEX class_pkey ON public.class USING btree (id);

alter table "public"."class" add constraint "class_pkey" PRIMARY KEY using index "class_pkey";

alter table "public"."class_attendance" add constraint "class_attendance_pkey" PRIMARY KEY using index "class_attendance_pkey";

alter table "public"."class" add constraint "class_check" CHECK ((starts_at < ends_at)) not valid;

alter table "public"."class" validate constraint "class_check";

alter table "public"."class" add constraint "class_workshop_id_fkey" FOREIGN KEY (workshop_id) REFERENCES public.workshop(id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."class" validate constraint "class_workshop_id_fkey";

alter table "public"."class_attendance" add constraint "class_attendance_class_id_fkey" FOREIGN KEY (class_id) REFERENCES public.class(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."class_attendance" validate constraint "class_attendance_class_id_fkey";

alter table "public"."class_attendance" add constraint "class_attendance_class_id_profile_id_key" UNIQUE using index "class_attendance_class_id_profile_id_key";

alter table "public"."class_attendance" add constraint "class_attendance_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES public.profile(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."class_attendance" validate constraint "class_attendance_profile_id_fkey";

alter table "public"."class_attendance" add constraint "class_attendance_recorded_by_fkey" FOREIGN KEY (recorded_by) REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."class_attendance" validate constraint "class_attendance_recorded_by_fkey";

set check_function_bodies = off;

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

CREATE OR REPLACE FUNCTION public.promote_user_after_submission()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  user_role_current app_role;
  has_completed boolean;
  user_id_current uuid;
begin
  select user_id into user_id_current from public.profile where id = new.profile_id;
  raise log '[promote_user_after_submission] enter user % form %', user_id_current, new.form_id;

  if user_id_current is null then
    raise log '[promote_user_after_submission] skip: missing user for profile %', new.profile_id;
    return new;
  end if;

  if not public.should_auto_promote_onboarding() then
    raise log '[promote_user_after_submission] skip: onboarding_mode=permission for user %', user_id_current;
    return new;
  end if;

  -- Mark assignment submitted first so completion check sees latest status.
  update public.form_assignment
  set status = 'submitted'
  where form_id = new.form_id
    and user_id = user_id_current;

  select coalesce(role, 'unassigned'::app_role)
    into user_role_current
    from public.user_roles
    where user_id = user_id_current;

  if user_role_current is distinct from 'unassigned' then
    raise log '[promote_user_after_submission] skip: role is % for user %', user_role_current, user_id_current;
    return new;
  end if;

  select coalesce(public.has_completed_required_forms(user_id_current), false) into has_completed;
  raise log '[promote_user_after_submission] eval user %, current_role %, has_completed %', user_id_current, user_role_current, has_completed;

  if has_completed then
    update public.user_roles
    set role = 'student'
    where user_id = user_id_current;
    raise log '[promote_user_after_submission] promoted user % to student', user_id_current;
  end if;

  return new;
end;
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



  create policy "form_assignment_self_insert"
  on "public"."form_assignment"
  as permissive
  for insert
  to public
with check (((user_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM public.form f
  WHERE ((f.id = form_assignment.form_id) AND (public.current_user_role() = ANY (f.auto_assign)))))));



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



  create policy "person_guardian_child_read_admin"
  on "public"."person_guardian_child"
  as permissive
  for select
  to public
using (public.authorize('profiles.read'::public.app_permissions));



  create policy "profile_read_admin"
  on "public"."profile"
  as permissive
  for select
  to public
using (public.authorize('profiles.read'::public.app_permissions));



  create policy "role_permission_admin_manage"
  on "public"."role_permission"
  as permissive
  for all
  to public
using (public.authorize('role_permission.manage'::public.app_permissions))
with check (public.authorize('role_permission.manage'::public.app_permissions));



  create policy "sign_up_flow_select_site_read"
  on "public"."sign_up_flow"
  as permissive
  for select
  to public
using (public.authorize('site.read'::public.app_permissions));



  create policy "user_roles_write_admin"
  on "public"."user_roles"
  as permissive
  for all
  to public
using (public.authorize('user_roles.manage'::public.app_permissions))
with check (public.authorize('user_roles.manage'::public.app_permissions));



  create policy "workshop_delete_admin"
  on "public"."workshop"
  as permissive
  for delete
  to public
using (public.authorize('workshop.delete'::public.app_permissions));



  create policy "workshop_insert_admin"
  on "public"."workshop"
  as permissive
  for insert
  to public
with check (public.authorize('workshop.create'::public.app_permissions));



  create policy "workshop_update_admin"
  on "public"."workshop"
  as permissive
  for update
  to public
using (public.authorize('workshop.update'::public.app_permissions))
with check (public.authorize('workshop.update'::public.app_permissions));



  create policy "workshop_enrollment_select_admin"
  on "public"."workshop_enrollment"
  as permissive
  for select
  to public
using (public.authorize('workshop_enrollment.read'::public.app_permissions));



  create policy "workshop_enrollment_update_admin"
  on "public"."workshop_enrollment"
  as permissive
  for update
  to public
using ((public.authorize('workshop_enrollment.update'::public.app_permissions) OR public.authorize('workshop_enrollment.update_status'::public.app_permissions)))
with check ((public.authorize('workshop_enrollment.update'::public.app_permissions) OR public.authorize('workshop_enrollment.update_status'::public.app_permissions)));


CREATE TRIGGER on_form_auto_assign_changed_sync_assignments AFTER UPDATE OF auto_assign ON public.form FOR EACH ROW EXECUTE FUNCTION public.sync_auto_assigned_forms_for_form_trigger();


