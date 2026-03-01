create type "public"."class_section_enrollment_status" as enum ('pending', 'approved', 'rejected');

drop trigger if exists "on_cohort_updated_set_timestamp" on "public"."cohort";

drop trigger if exists "on_cohort_enrollment_set_decision_fields" on "public"."cohort_enrollment";

drop trigger if exists "on_cohort_enrollment_updated_set_timestamp" on "public"."cohort_enrollment";

drop trigger if exists "on_semester_set_months" on "public"."semester";

drop trigger if exists "on_semester_updated_set_timestamp" on "public"."semester";

drop policy "cohort_delete_admin" on "public"."cohort";

drop policy "cohort_insert_admin" on "public"."cohort";

drop policy "cohort_read_auth_admin" on "public"."cohort";

drop policy "cohort_select_all" on "public"."cohort";

drop policy "cohort_update_admin" on "public"."cohort";

drop policy "cohort_enrollment_insert_self" on "public"."cohort_enrollment";

drop policy "cohort_enrollment_read_auth_admin" on "public"."cohort_enrollment";

drop policy "cohort_enrollment_select_admin" on "public"."cohort_enrollment";

drop policy "cohort_enrollment_select_self" on "public"."cohort_enrollment";

drop policy "cohort_enrollment_update_admin" on "public"."cohort_enrollment";

drop policy "form_select_admin_role" on "public"."form";

drop policy "semester_delete_admin" on "public"."semester";

drop policy "semester_insert_admin" on "public"."semester";

drop policy "semester_read_auth_admin" on "public"."semester";

drop policy "semester_select_all" on "public"."semester";

drop policy "semester_update_admin" on "public"."semester";

revoke delete on table "public"."class" from "anon";

revoke insert on table "public"."class" from "anon";

revoke references on table "public"."class" from "anon";

revoke select on table "public"."class" from "anon";

revoke trigger on table "public"."class" from "anon";

revoke truncate on table "public"."class" from "anon";

revoke update on table "public"."class" from "anon";

revoke delete on table "public"."cohort" from "anon";

revoke insert on table "public"."cohort" from "anon";

revoke references on table "public"."cohort" from "anon";

revoke select on table "public"."cohort" from "anon";

revoke trigger on table "public"."cohort" from "anon";

revoke truncate on table "public"."cohort" from "anon";

revoke update on table "public"."cohort" from "anon";

revoke delete on table "public"."cohort" from "authenticated";

revoke insert on table "public"."cohort" from "authenticated";

revoke references on table "public"."cohort" from "authenticated";

revoke select on table "public"."cohort" from "authenticated";

revoke trigger on table "public"."cohort" from "authenticated";

revoke truncate on table "public"."cohort" from "authenticated";

revoke update on table "public"."cohort" from "authenticated";

revoke delete on table "public"."cohort" from "service_role";

revoke insert on table "public"."cohort" from "service_role";

revoke references on table "public"."cohort" from "service_role";

revoke select on table "public"."cohort" from "service_role";

revoke trigger on table "public"."cohort" from "service_role";

revoke truncate on table "public"."cohort" from "service_role";

revoke update on table "public"."cohort" from "service_role";

revoke delete on table "public"."cohort" from "supabase_auth_admin";

revoke insert on table "public"."cohort" from "supabase_auth_admin";

revoke references on table "public"."cohort" from "supabase_auth_admin";

revoke select on table "public"."cohort" from "supabase_auth_admin";

revoke trigger on table "public"."cohort" from "supabase_auth_admin";

revoke truncate on table "public"."cohort" from "supabase_auth_admin";

revoke update on table "public"."cohort" from "supabase_auth_admin";

revoke delete on table "public"."cohort_enrollment" from "anon";

revoke insert on table "public"."cohort_enrollment" from "anon";

revoke references on table "public"."cohort_enrollment" from "anon";

revoke select on table "public"."cohort_enrollment" from "anon";

revoke trigger on table "public"."cohort_enrollment" from "anon";

revoke truncate on table "public"."cohort_enrollment" from "anon";

revoke update on table "public"."cohort_enrollment" from "anon";

revoke delete on table "public"."cohort_enrollment" from "authenticated";

revoke insert on table "public"."cohort_enrollment" from "authenticated";

revoke references on table "public"."cohort_enrollment" from "authenticated";

revoke select on table "public"."cohort_enrollment" from "authenticated";

revoke trigger on table "public"."cohort_enrollment" from "authenticated";

revoke truncate on table "public"."cohort_enrollment" from "authenticated";

revoke update on table "public"."cohort_enrollment" from "authenticated";

revoke delete on table "public"."cohort_enrollment" from "service_role";

revoke insert on table "public"."cohort_enrollment" from "service_role";

revoke references on table "public"."cohort_enrollment" from "service_role";

revoke select on table "public"."cohort_enrollment" from "service_role";

revoke trigger on table "public"."cohort_enrollment" from "service_role";

revoke truncate on table "public"."cohort_enrollment" from "service_role";

revoke update on table "public"."cohort_enrollment" from "service_role";

revoke delete on table "public"."cohort_enrollment" from "supabase_auth_admin";

revoke insert on table "public"."cohort_enrollment" from "supabase_auth_admin";

revoke references on table "public"."cohort_enrollment" from "supabase_auth_admin";

revoke select on table "public"."cohort_enrollment" from "supabase_auth_admin";

revoke trigger on table "public"."cohort_enrollment" from "supabase_auth_admin";

revoke truncate on table "public"."cohort_enrollment" from "supabase_auth_admin";

revoke update on table "public"."cohort_enrollment" from "supabase_auth_admin";

revoke delete on table "public"."semester" from "anon";

revoke insert on table "public"."semester" from "anon";

revoke references on table "public"."semester" from "anon";

revoke select on table "public"."semester" from "anon";

revoke trigger on table "public"."semester" from "anon";

revoke truncate on table "public"."semester" from "anon";

revoke update on table "public"."semester" from "anon";

revoke delete on table "public"."semester" from "authenticated";

revoke insert on table "public"."semester" from "authenticated";

revoke references on table "public"."semester" from "authenticated";

revoke select on table "public"."semester" from "authenticated";

revoke trigger on table "public"."semester" from "authenticated";

revoke truncate on table "public"."semester" from "authenticated";

revoke update on table "public"."semester" from "authenticated";

revoke delete on table "public"."semester" from "service_role";

revoke insert on table "public"."semester" from "service_role";

revoke references on table "public"."semester" from "service_role";

revoke select on table "public"."semester" from "service_role";

revoke trigger on table "public"."semester" from "service_role";

revoke truncate on table "public"."semester" from "service_role";

revoke update on table "public"."semester" from "service_role";

revoke delete on table "public"."semester" from "supabase_auth_admin";

revoke insert on table "public"."semester" from "supabase_auth_admin";

revoke references on table "public"."semester" from "supabase_auth_admin";

revoke select on table "public"."semester" from "supabase_auth_admin";

revoke trigger on table "public"."semester" from "supabase_auth_admin";

revoke truncate on table "public"."semester" from "supabase_auth_admin";

revoke update on table "public"."semester" from "supabase_auth_admin";

alter table "public"."class" drop constraint "class_cohort_id_fkey";

alter table "public"."cohort" drop constraint "cohort_semester_id_fkey";

alter table "public"."cohort" drop constraint "cohort_semester_id_name_key";

alter table "public"."cohort_enrollment" drop constraint "cohort_enrollment_cohort_id_fkey";

alter table "public"."cohort_enrollment" drop constraint "cohort_enrollment_cohort_id_user_id_key";

alter table "public"."cohort_enrollment" drop constraint "cohort_enrollment_decided_by_fkey";

alter table "public"."cohort_enrollment" drop constraint "cohort_enrollment_user_id_fkey";

alter table "public"."semester" drop constraint "semester_check";

alter table "public"."semester" drop constraint "semester_name_key";

alter table "public"."semester" drop constraint "semester_starts_month_ends_month_key";

drop function if exists "public"."set_cohort_enrollment_decision_fields"();

drop function if exists "public"."set_semester_months"();

drop function if exists "public"."touch_cohort_enrollment_updated_at"();

drop function if exists "public"."touch_cohort_updated_at"();

drop function if exists "public"."touch_semester_updated_at"();

alter table "public"."cohort" drop constraint "cohort_pkey";

alter table "public"."cohort_enrollment" drop constraint "cohort_enrollment_pkey";

alter table "public"."semester" drop constraint "semester_pkey";

drop index if exists "public"."cohort_enrollment_cohort_id_user_id_key";

drop index if exists "public"."cohort_enrollment_pkey";

drop index if exists "public"."cohort_pkey";

drop index if exists "public"."cohort_semester_id_name_key";

drop index if exists "public"."semester_name_key";

drop index if exists "public"."semester_pkey";

drop index if exists "public"."semester_starts_month_ends_month_key";

drop table "public"."cohort";

drop table "public"."cohort_enrollment";

drop table "public"."semester";

  create table "public"."class_section" (
    "id" uuid not null default gen_random_uuid(),
    "description" text,
    "enrollment_open_at" timestamp with time zone,
    "enrollment_close_at" timestamp with time zone,
    "capacity" integer not null default 0,
    "wait_list_capacity" integer not null default 0,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."class_section" enable row level security;


  create table "public"."class_section_enrollment" (
    "id" uuid not null default gen_random_uuid(),
    "class_section_id" uuid,
    "user_id" uuid,
    "status" public.class_section_enrollment_status not null default 'pending'::public.class_section_enrollment_status,
    "requested_at" timestamp with time zone not null default now(),
    "decided_at" timestamp with time zone,
    "decided_by" uuid,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."class_section_enrollment" enable row level security;

alter table "public"."role_permission" alter column permission type "public"."app_permissions" using permission::text::"public"."app_permissions";

alter table "public"."class" drop column "cohort_id";

alter table "public"."class" add column "class_section_id" uuid;

drop type "public"."cohort_enrollment_status";

CREATE UNIQUE INDEX class_section_enrollment_class_section_id_user_id_key ON public.class_section_enrollment USING btree (class_section_id, user_id);

CREATE UNIQUE INDEX class_section_enrollment_pkey ON public.class_section_enrollment USING btree (id);

CREATE UNIQUE INDEX class_section_pkey ON public.class_section USING btree (id);

alter table "public"."class_section" add constraint "class_section_pkey" PRIMARY KEY using index "class_section_pkey";

alter table "public"."class_section_enrollment" add constraint "class_section_enrollment_pkey" PRIMARY KEY using index "class_section_enrollment_pkey";

alter table "public"."class" add constraint "class_class_section_id_fkey" FOREIGN KEY (class_section_id) REFERENCES public.class_section(id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."class" validate constraint "class_class_section_id_fkey";

alter table "public"."class_section" add constraint "class_section_capacity_check" CHECK ((capacity >= 0)) not valid;

alter table "public"."class_section" validate constraint "class_section_capacity_check";

alter table "public"."class_section" add constraint "class_section_check" CHECK (((enrollment_open_at IS NULL) OR (enrollment_close_at IS NULL) OR (enrollment_open_at < enrollment_close_at))) not valid;

alter table "public"."class_section" validate constraint "class_section_check";

alter table "public"."class_section" add constraint "class_section_wait_list_capacity_check" CHECK ((wait_list_capacity >= 0)) not valid;

alter table "public"."class_section" validate constraint "class_section_wait_list_capacity_check";

alter table "public"."class_section_enrollment" add constraint "class_section_enrollment_class_section_id_fkey" FOREIGN KEY (class_section_id) REFERENCES public.class_section(id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."class_section_enrollment" validate constraint "class_section_enrollment_class_section_id_fkey";

alter table "public"."class_section_enrollment" add constraint "class_section_enrollment_class_section_id_user_id_key" UNIQUE using index "class_section_enrollment_class_section_id_user_id_key";

alter table "public"."class_section_enrollment" add constraint "class_section_enrollment_decided_by_fkey" FOREIGN KEY (decided_by) REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."class_section_enrollment" validate constraint "class_section_enrollment_decided_by_fkey";

alter table "public"."class_section_enrollment" add constraint "class_section_enrollment_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."class_section_enrollment" validate constraint "class_section_enrollment_user_id_fkey";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.set_class_section_enrollment_decision_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.status is distinct from old.status and new.status is distinct from 'pending' then
    new.decided_at := coalesce(new.decided_at, now());
    new.decided_by := coalesce(new.decided_by, auth.uid());
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.touch_class_section_enrollment_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.touch_class_section_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

grant delete on table "public"."class_section" to "authenticated";

grant insert on table "public"."class_section" to "authenticated";

grant references on table "public"."class_section" to "authenticated";

grant select on table "public"."class_section" to "authenticated";

grant trigger on table "public"."class_section" to "authenticated";

grant truncate on table "public"."class_section" to "authenticated";

grant update on table "public"."class_section" to "authenticated";

grant delete on table "public"."class_section" to "service_role";

grant insert on table "public"."class_section" to "service_role";

grant references on table "public"."class_section" to "service_role";

grant select on table "public"."class_section" to "service_role";

grant trigger on table "public"."class_section" to "service_role";

grant truncate on table "public"."class_section" to "service_role";

grant update on table "public"."class_section" to "service_role";

grant delete on table "public"."class_section" to "supabase_auth_admin";

grant insert on table "public"."class_section" to "supabase_auth_admin";

grant references on table "public"."class_section" to "supabase_auth_admin";

grant select on table "public"."class_section" to "supabase_auth_admin";

grant trigger on table "public"."class_section" to "supabase_auth_admin";

grant truncate on table "public"."class_section" to "supabase_auth_admin";

grant update on table "public"."class_section" to "supabase_auth_admin";

grant delete on table "public"."class_section_enrollment" to "authenticated";

grant insert on table "public"."class_section_enrollment" to "authenticated";

grant references on table "public"."class_section_enrollment" to "authenticated";

grant select on table "public"."class_section_enrollment" to "authenticated";

grant trigger on table "public"."class_section_enrollment" to "authenticated";

grant truncate on table "public"."class_section_enrollment" to "authenticated";

grant update on table "public"."class_section_enrollment" to "authenticated";

grant delete on table "public"."class_section_enrollment" to "service_role";

grant insert on table "public"."class_section_enrollment" to "service_role";

grant references on table "public"."class_section_enrollment" to "service_role";

grant select on table "public"."class_section_enrollment" to "service_role";

grant trigger on table "public"."class_section_enrollment" to "service_role";

grant truncate on table "public"."class_section_enrollment" to "service_role";

grant update on table "public"."class_section_enrollment" to "service_role";

grant delete on table "public"."class_section_enrollment" to "supabase_auth_admin";

grant insert on table "public"."class_section_enrollment" to "supabase_auth_admin";

grant references on table "public"."class_section_enrollment" to "supabase_auth_admin";

grant select on table "public"."class_section_enrollment" to "supabase_auth_admin";

grant trigger on table "public"."class_section_enrollment" to "supabase_auth_admin";

grant truncate on table "public"."class_section_enrollment" to "supabase_auth_admin";

grant update on table "public"."class_section_enrollment" to "supabase_auth_admin";


  create policy "class_section_delete_admin"
  on "public"."class_section"
  as permissive
  for delete
  to public
using (public.authorize('class_section.delete'::public.app_permissions));



  create policy "class_section_insert_admin"
  on "public"."class_section"
  as permissive
  for insert
  to public
with check (public.authorize('class_section.create'::public.app_permissions));



  create policy "class_section_read_auth_admin"
  on "public"."class_section"
  as permissive
  for select
  to supabase_auth_admin
using (true);



  create policy "class_section_select_all"
  on "public"."class_section"
  as permissive
  for select
  to public
using (true);



  create policy "class_section_update_admin"
  on "public"."class_section"
  as permissive
  for update
  to public
using (public.authorize('class_section.update'::public.app_permissions))
with check (public.authorize('class_section.update'::public.app_permissions));



  create policy "class_section_enrollment_insert_self"
  on "public"."class_section_enrollment"
  as permissive
  for insert
  to public
with check (((user_id = auth.uid()) AND (COALESCE(status, 'pending'::public.class_section_enrollment_status) = 'pending'::public.class_section_enrollment_status)));



  create policy "class_section_enrollment_read_auth_admin"
  on "public"."class_section_enrollment"
  as permissive
  for select
  to supabase_auth_admin
using (true);



  create policy "class_section_enrollment_select_admin"
  on "public"."class_section_enrollment"
  as permissive
  for select
  to public
using (public.authorize('class_section_enrollment.read'::public.app_permissions));



  create policy "class_section_enrollment_select_self"
  on "public"."class_section_enrollment"
  as permissive
  for select
  to public
using ((user_id = auth.uid()));



  create policy "class_section_enrollment_update_admin"
  on "public"."class_section_enrollment"
  as permissive
  for update
  to public
using ((public.authorize('class_section_enrollment.update'::public.app_permissions) OR public.authorize('class_section_enrollment.update_status'::public.app_permissions)))
with check ((public.authorize('class_section_enrollment.update'::public.app_permissions) OR public.authorize('class_section_enrollment.update_status'::public.app_permissions)));


CREATE TRIGGER on_class_section_updated_set_timestamp BEFORE UPDATE ON public.class_section FOR EACH ROW EXECUTE FUNCTION public.touch_class_section_updated_at();

CREATE TRIGGER on_class_section_enrollment_set_decision_fields BEFORE UPDATE ON public.class_section_enrollment FOR EACH ROW EXECUTE FUNCTION public.set_class_section_enrollment_decision_fields();

CREATE TRIGGER on_class_section_enrollment_updated_set_timestamp BEFORE UPDATE ON public.class_section_enrollment FOR EACH ROW EXECUTE FUNCTION public.touch_class_section_enrollment_updated_at();
