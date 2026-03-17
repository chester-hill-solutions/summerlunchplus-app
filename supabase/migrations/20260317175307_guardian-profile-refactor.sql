create type "public"."session_attendance_status" as enum ('present', 'absent', 'excused');

drop trigger if exists "on_profile_updated_set_timestamp" on "public"."profiles";

drop policy "profiles_read_auth_admin" on "public"."profiles";

drop policy "profiles_read_self" on "public"."profiles";

drop policy "profiles_update_self" on "public"."profiles";

drop policy "form_question_assignee_read" on "public"."form_question";

drop policy "workshop_enrollment_insert_self" on "public"."workshop_enrollment";

drop policy "workshop_enrollment_select_self" on "public"."workshop_enrollment";

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

revoke delete on table "public"."person" from "anon";

revoke insert on table "public"."person" from "anon";

revoke references on table "public"."person" from "anon";

revoke select on table "public"."person" from "anon";

revoke trigger on table "public"."person" from "anon";

revoke truncate on table "public"."person" from "anon";

revoke update on table "public"."person" from "anon";

revoke delete on table "public"."person" from "authenticated";

revoke insert on table "public"."person" from "authenticated";

revoke references on table "public"."person" from "authenticated";

revoke select on table "public"."person" from "authenticated";

revoke trigger on table "public"."person" from "authenticated";

revoke truncate on table "public"."person" from "authenticated";

revoke update on table "public"."person" from "authenticated";

revoke delete on table "public"."person" from "service_role";

revoke insert on table "public"."person" from "service_role";

revoke references on table "public"."person" from "service_role";

revoke select on table "public"."person" from "service_role";

revoke trigger on table "public"."person" from "service_role";

revoke truncate on table "public"."person" from "service_role";

revoke update on table "public"."person" from "service_role";

revoke delete on table "public"."person_parent" from "anon";

revoke insert on table "public"."person_parent" from "anon";

revoke references on table "public"."person_parent" from "anon";

revoke select on table "public"."person_parent" from "anon";

revoke trigger on table "public"."person_parent" from "anon";

revoke truncate on table "public"."person_parent" from "anon";

revoke update on table "public"."person_parent" from "anon";

revoke delete on table "public"."person_parent" from "authenticated";

revoke insert on table "public"."person_parent" from "authenticated";

revoke references on table "public"."person_parent" from "authenticated";

revoke select on table "public"."person_parent" from "authenticated";

revoke trigger on table "public"."person_parent" from "authenticated";

revoke truncate on table "public"."person_parent" from "authenticated";

revoke update on table "public"."person_parent" from "authenticated";

revoke delete on table "public"."person_parent" from "service_role";

revoke insert on table "public"."person_parent" from "service_role";

revoke references on table "public"."person_parent" from "service_role";

revoke select on table "public"."person_parent" from "service_role";

revoke trigger on table "public"."person_parent" from "service_role";

revoke truncate on table "public"."person_parent" from "service_role";

revoke update on table "public"."person_parent" from "service_role";

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

revoke select on table "public"."profiles" from "authenticated";

revoke trigger on table "public"."profiles" from "authenticated";

revoke truncate on table "public"."profiles" from "authenticated";

revoke update on table "public"."profiles" from "authenticated";

revoke delete on table "public"."profiles" from "service_role";

revoke insert on table "public"."profiles" from "service_role";

revoke references on table "public"."profiles" from "service_role";

revoke select on table "public"."profiles" from "service_role";

revoke trigger on table "public"."profiles" from "service_role";

revoke truncate on table "public"."profiles" from "service_role";

revoke update on table "public"."profiles" from "service_role";

revoke delete on table "public"."profiles" from "supabase_auth_admin";

revoke insert on table "public"."profiles" from "supabase_auth_admin";

revoke references on table "public"."profiles" from "supabase_auth_admin";

revoke select on table "public"."profiles" from "supabase_auth_admin";

revoke trigger on table "public"."profiles" from "supabase_auth_admin";

revoke truncate on table "public"."profiles" from "supabase_auth_admin";

revoke update on table "public"."profiles" from "supabase_auth_admin";

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

revoke delete on table "public"."sign_up_flow" from "anon";

revoke insert on table "public"."sign_up_flow" from "anon";

revoke references on table "public"."sign_up_flow" from "anon";

revoke select on table "public"."sign_up_flow" from "anon";

revoke trigger on table "public"."sign_up_flow" from "anon";

revoke truncate on table "public"."sign_up_flow" from "anon";

revoke update on table "public"."sign_up_flow" from "anon";

revoke delete on table "public"."sign_up_flow" from "authenticated";

revoke insert on table "public"."sign_up_flow" from "authenticated";

revoke references on table "public"."sign_up_flow" from "authenticated";

revoke trigger on table "public"."sign_up_flow" from "authenticated";

revoke truncate on table "public"."sign_up_flow" from "authenticated";

revoke update on table "public"."sign_up_flow" from "authenticated";

revoke delete on table "public"."user_roles" from "anon";

revoke insert on table "public"."user_roles" from "anon";

revoke references on table "public"."user_roles" from "anon";

revoke select on table "public"."user_roles" from "anon";

revoke trigger on table "public"."user_roles" from "anon";

revoke truncate on table "public"."user_roles" from "anon";

revoke update on table "public"."user_roles" from "anon";

revoke delete on table "public"."workshop" from "anon";

revoke insert on table "public"."workshop" from "anon";

revoke references on table "public"."workshop" from "anon";

revoke select on table "public"."workshop" from "anon";

revoke trigger on table "public"."workshop" from "anon";

revoke truncate on table "public"."workshop" from "anon";

revoke update on table "public"."workshop" from "anon";

revoke delete on table "public"."workshop_enrollment" from "anon";

revoke insert on table "public"."workshop_enrollment" from "anon";

revoke references on table "public"."workshop_enrollment" from "anon";

revoke select on table "public"."workshop_enrollment" from "anon";

revoke trigger on table "public"."workshop_enrollment" from "anon";

revoke truncate on table "public"."workshop_enrollment" from "anon";

revoke update on table "public"."workshop_enrollment" from "anon";

alter table "public"."form_question" drop constraint "form_question_form_id_fkey";

alter table "public"."form_question" drop constraint "form_question_form_id_position_key";

alter table "public"."person" drop constraint "person_email_key";

alter table "public"."person" drop constraint "person_role_check";

alter table "public"."person" drop constraint "person_user_id_fkey";

alter table "public"."person_parent" drop constraint "person_parent_parent_id_fkey";

alter table "public"."person_parent" drop constraint "person_parent_person_id_fkey";

alter table "public"."person_parent" drop constraint "person_parent_person_id_parent_id_key";

alter table "public"."profiles" drop constraint "profiles_id_fkey";

alter table "public"."workshop_enrollment" drop constraint "workshop_enrollment_user_id_fkey";

alter table "public"."workshop_enrollment" drop constraint "workshop_enrollment_workshop_id_user_id_key";

drop trigger if exists "on_auth_user_created_create_profile" on "auth"."users";
drop function if exists "public"."handle_new_profile"();

alter table "public"."person" drop constraint "person_pkey";

alter table "public"."person_parent" drop constraint "person_parent_pkey";

alter table "public"."profiles" drop constraint "profiles_pkey";

drop index if exists "public"."form_question_form_id_position_key";

drop index if exists "public"."person_email_key";

drop index if exists "public"."person_parent_person_id_parent_id_key";

drop index if exists "public"."person_parent_pkey";

drop index if exists "public"."person_pkey";

drop index if exists "public"."profiles_pkey";

drop index if exists "public"."workshop_enrollment_workshop_id_user_id_key";

drop table "public"."person";

drop table "public"."person_parent";

drop table "public"."profiles";

alter table "public"."user_roles" alter column "role" drop default;

alter type "public"."app_permissions" rename to "app_permissions__old_version_to_be_dropped";

create type "public"."app_permissions" as enum ('site.read', 'form.create', 'form.read', 'form.update', 'form.delete', 'form_question.create', 'form_question.read', 'form_question.update', 'form_question.delete', 'form_question_map.create', 'form_question_map.read', 'form_question_map.update', 'form_question_map.delete', 'form_assignment.create', 'form_assignment.read', 'form_assignment.update', 'form_assignment.delete', 'form_submission.create', 'form_submission.read', 'form_submission.update', 'form_submission.delete', 'form_answer.create', 'form_answer.read', 'form_answer.update', 'form_answer.delete', 'semester.create', 'semester.read', 'semester.update', 'semester.delete', 'workshop.create', 'workshop.read', 'workshop.update', 'workshop.delete', 'workshop_enrollment.create', 'workshop_enrollment.read', 'workshop_enrollment.update', 'workshop_enrollment.update_status', 'session_attendance.create', 'session_attendance.read', 'session_attendance.update', 'session_attendance.delete', 'user_roles.manage', 'role_permission.manage', 'profiles.read', 'profiles.update');

alter type "public"."app_role" rename to "app_role__old_version_to_be_dropped";

create type "public"."app_role" as enum ('unassigned', 'admin', 'manager', 'staff', 'instructor', 'student', 'guardian');

drop function if exists public.current_user_role() cascade;
drop function if exists public.authorize(public.app_permissions__old_version_to_be_dropped) cascade;

create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(
    nullif((current_setting('request.jwt.claims', true)::jsonb ->> 'user_role'), '')::public.app_role,
    'unassigned'::public.app_role
  );
$$;

create or replace function public.authorize(requested_permission public.app_permissions)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
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
$$;

alter table public.form
  add column if not exists auto_assign public.app_role[] not null default '{}'::public.app_role[];

alter table public.sign_up_flow
  add column if not exists roles public.app_role[] not null default '{}'::public.app_role[];



  create table "public"."form_question_map" (
    "form_id" uuid not null,
    "question_code" text not null,
    "position" integer not null,
    "prompt_override" text,
    "options_override" jsonb
      );


alter table "public"."form_question_map" enable row level security;


  create table "public"."person_guardian_child" (
    "id" uuid not null default gen_random_uuid(),
    "child_profile_id" uuid not null,
    "guardian_profile_id" uuid not null,
    "primary_child" boolean not null default false
      );


alter table "public"."person_guardian_child" enable row level security;


  create table "public"."profile" (
    "id" uuid not null default gen_random_uuid(),
    "user_id" uuid,
    "role" public.app_role not null,
    "email" text,
    "firstname" text,
    "surname" text,
    "date_of_birth" date,
    "phone" text,
    "postcode" text,
    "partner_program" text,
    "password_set" boolean not null default false,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."profile" enable row level security;


  create table "public"."semester" (
    "id" uuid not null default gen_random_uuid(),
    "starts_at" timestamp with time zone not null,
    "ends_at" timestamp with time zone not null,
    "enrollment_open_at" timestamp with time zone,
    "enrollment_close_at" timestamp with time zone,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."semester" enable row level security;


  create table "public"."session_attendance" (
    "id" uuid not null default gen_random_uuid(),
    "session_id" uuid not null,
    "profile_id" uuid not null,
    "status" public.session_attendance_status not null default 'present'::public.session_attendance_status,
    "recorded_by" uuid,
    "notes" text,
    "created_at" timestamp with time zone not null default now(),
    "updated_at" timestamp with time zone not null default now()
      );


alter table "public"."session_attendance" enable row level security;

alter table "public"."invites" alter column role type "public"."app_role" using (case when role::text = 'parent' then 'guardian' else role::text end)::"public"."app_role";

alter table "public"."role_permission" alter column permission type "public"."app_permissions" using permission::text::"public"."app_permissions";

alter table "public"."role_permission" alter column role type "public"."app_role" using (case when role::text = 'parent' then 'guardian' else role::text end)::"public"."app_role";

alter table "public"."user_roles" alter column role type "public"."app_role" using (case when role::text = 'parent' then 'guardian' else role::text end)::"public"."app_role";

alter table "public"."user_roles" alter column "role" set default 'unassigned'::public.app_role;

drop type "public"."app_permissions__old_version_to_be_dropped" cascade;

drop type "public"."app_role__old_version_to_be_dropped" cascade;

alter table public.form
  add column if not exists auto_assign public.app_role[] not null default '{}'::public.app_role[];

alter table public.sign_up_flow
  add column if not exists roles public.app_role[] not null default '{}'::public.app_role[];

alter table "public"."form_question" drop column "form_id";

alter table "public"."form_question" drop column "position";

alter table "public"."workshop" add column "semester_id" uuid;

alter table "public"."workshop_enrollment" drop column "user_id";

alter table "public"."workshop_enrollment" add column "profile_id" uuid;

alter table "public"."workshop_enrollment" add column "semester_id" uuid;

with fallback_semester as (
  insert into public.semester (starts_at, ends_at)
  values (now(), now() + interval '1 day')
  on conflict do nothing
  returning id
), fallback as (
  select id from fallback_semester
  union all
  select id from public.semester limit 1
)
update public.workshop
set semester_id = (select id from fallback)
where semester_id is null;

update public.workshop_enrollment we
set semester_id = w.semester_id
from public.workshop w
where we.workshop_id = w.id
  and we.semester_id is null;

alter table "public"."workshop" alter column "semester_id" set not null;
alter table "public"."workshop_enrollment" alter column "semester_id" set not null;

CREATE UNIQUE INDEX form_question_map_form_id_position_key ON public.form_question_map USING btree (form_id, "position");

CREATE UNIQUE INDEX form_question_map_form_id_question_code_key ON public.form_question_map USING btree (form_id, question_code);

CREATE UNIQUE INDEX person_guardian_child_guardian_profile_id_child_profile_id_key ON public.person_guardian_child USING btree (guardian_profile_id, child_profile_id);

CREATE UNIQUE INDEX person_guardian_child_pkey ON public.person_guardian_child USING btree (id);

CREATE UNIQUE INDEX person_guardian_child_primary_one ON public.person_guardian_child USING btree (guardian_profile_id) WHERE (primary_child = true);

CREATE UNIQUE INDEX profile_email_key ON public.profile USING btree (email);

CREATE UNIQUE INDEX profile_pkey ON public.profile USING btree (id);

CREATE UNIQUE INDEX semester_pkey ON public.semester USING btree (id);

CREATE UNIQUE INDEX session_attendance_pkey ON public.session_attendance USING btree (id);

CREATE UNIQUE INDEX session_attendance_session_id_profile_id_key ON public.session_attendance USING btree (session_id, profile_id);

CREATE UNIQUE INDEX workshop_enrollment_semester_id_profile_id_key ON public.workshop_enrollment USING btree (semester_id, profile_id);

alter table "public"."person_guardian_child" add constraint "person_guardian_child_pkey" PRIMARY KEY using index "person_guardian_child_pkey";

alter table "public"."profile" add constraint "profile_pkey" PRIMARY KEY using index "profile_pkey";

alter table "public"."semester" add constraint "semester_pkey" PRIMARY KEY using index "semester_pkey";

alter table "public"."session_attendance" add constraint "session_attendance_pkey" PRIMARY KEY using index "session_attendance_pkey";

alter table "public"."form_question_map" add constraint "form_question_map_form_id_fkey" FOREIGN KEY (form_id) REFERENCES public.form(id) ON DELETE CASCADE not valid;

alter table "public"."form_question_map" validate constraint "form_question_map_form_id_fkey";

alter table "public"."form_question_map" add constraint "form_question_map_form_id_position_key" UNIQUE using index "form_question_map_form_id_position_key";

alter table "public"."form_question_map" add constraint "form_question_map_form_id_question_code_key" UNIQUE using index "form_question_map_form_id_question_code_key";

alter table "public"."form_question_map" add constraint "form_question_map_question_code_fkey" FOREIGN KEY (question_code) REFERENCES public.form_question(question_code) ON DELETE CASCADE not valid;

alter table "public"."form_question_map" validate constraint "form_question_map_question_code_fkey";

alter table "public"."person_guardian_child" add constraint "person_guardian_child_child_profile_id_fkey" FOREIGN KEY (child_profile_id) REFERENCES public.profile(id) ON DELETE CASCADE not valid;

alter table "public"."person_guardian_child" validate constraint "person_guardian_child_child_profile_id_fkey";

alter table "public"."person_guardian_child" add constraint "person_guardian_child_guardian_profile_id_child_profile_id_key" UNIQUE using index "person_guardian_child_guardian_profile_id_child_profile_id_key";

alter table "public"."person_guardian_child" add constraint "person_guardian_child_guardian_profile_id_fkey" FOREIGN KEY (guardian_profile_id) REFERENCES public.profile(id) ON DELETE CASCADE not valid;

alter table "public"."person_guardian_child" validate constraint "person_guardian_child_guardian_profile_id_fkey";

alter table "public"."profile" add constraint "profile_email_key" UNIQUE using index "profile_email_key";

alter table "public"."profile" add constraint "profile_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE not valid;

alter table "public"."profile" validate constraint "profile_user_id_fkey";

alter table "public"."semester" add constraint "semester_check" CHECK ((starts_at < ends_at)) not valid;

alter table "public"."semester" validate constraint "semester_check";

alter table "public"."semester" add constraint "semester_check1" CHECK (((enrollment_open_at IS NULL) OR (enrollment_close_at IS NULL) OR (enrollment_open_at < enrollment_close_at))) not valid;

alter table "public"."semester" validate constraint "semester_check1";

alter table "public"."session_attendance" add constraint "session_attendance_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES public.profile(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."session_attendance" validate constraint "session_attendance_profile_id_fkey";

alter table "public"."session_attendance" add constraint "session_attendance_recorded_by_fkey" FOREIGN KEY (recorded_by) REFERENCES auth.users(id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."session_attendance" validate constraint "session_attendance_recorded_by_fkey";

alter table "public"."session_attendance" add constraint "session_attendance_session_id_fkey" FOREIGN KEY (session_id) REFERENCES public.session(id) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."session_attendance" validate constraint "session_attendance_session_id_fkey";

alter table "public"."session_attendance" add constraint "session_attendance_session_id_profile_id_key" UNIQUE using index "session_attendance_session_id_profile_id_key";

alter table "public"."workshop" add constraint "workshop_semester_id_fkey" FOREIGN KEY (semester_id) REFERENCES public.semester(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."workshop" validate constraint "workshop_semester_id_fkey";

alter table "public"."workshop_enrollment" add constraint "workshop_enrollment_profile_id_fkey" FOREIGN KEY (profile_id) REFERENCES public.profile(id) ON UPDATE CASCADE ON DELETE SET NULL not valid;

alter table "public"."workshop_enrollment" validate constraint "workshop_enrollment_profile_id_fkey";

alter table "public"."workshop_enrollment" add constraint "workshop_enrollment_semester_id_fkey" FOREIGN KEY (semester_id) REFERENCES public.semester(id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."workshop_enrollment" validate constraint "workshop_enrollment_semester_id_fkey";

alter table "public"."workshop_enrollment" add constraint "workshop_enrollment_semester_id_profile_id_key" UNIQUE using index "workshop_enrollment_semester_id_profile_id_key";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.set_workshop_enrollment_semester_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.workshop_id is not null then
    select semester_id into new.semester_id
    from public.workshop
    where id = new.workshop_id;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.touch_semester_updated_at()
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

CREATE OR REPLACE FUNCTION public.touch_session_attendance_updated_at()
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

grant delete on table "public"."form_question_map" to "authenticated";

grant insert on table "public"."form_question_map" to "authenticated";

grant references on table "public"."form_question_map" to "authenticated";

grant select on table "public"."form_question_map" to "authenticated";

grant trigger on table "public"."form_question_map" to "authenticated";

grant truncate on table "public"."form_question_map" to "authenticated";

grant update on table "public"."form_question_map" to "authenticated";

grant delete on table "public"."form_question_map" to "service_role";

grant insert on table "public"."form_question_map" to "service_role";

grant references on table "public"."form_question_map" to "service_role";

grant select on table "public"."form_question_map" to "service_role";

grant trigger on table "public"."form_question_map" to "service_role";

grant truncate on table "public"."form_question_map" to "service_role";

grant update on table "public"."form_question_map" to "service_role";

grant delete on table "public"."form_question_map" to "supabase_auth_admin";

grant insert on table "public"."form_question_map" to "supabase_auth_admin";

grant references on table "public"."form_question_map" to "supabase_auth_admin";

grant select on table "public"."form_question_map" to "supabase_auth_admin";

grant trigger on table "public"."form_question_map" to "supabase_auth_admin";

grant truncate on table "public"."form_question_map" to "supabase_auth_admin";

grant update on table "public"."form_question_map" to "supabase_auth_admin";

grant insert on table "public"."person_guardian_child" to "authenticated";

grant select on table "public"."person_guardian_child" to "authenticated";

grant update on table "public"."person_guardian_child" to "authenticated";

grant delete on table "public"."person_guardian_child" to "service_role";

grant insert on table "public"."person_guardian_child" to "service_role";

grant references on table "public"."person_guardian_child" to "service_role";

grant select on table "public"."person_guardian_child" to "service_role";

grant trigger on table "public"."person_guardian_child" to "service_role";

grant truncate on table "public"."person_guardian_child" to "service_role";

grant update on table "public"."person_guardian_child" to "service_role";

grant delete on table "public"."person_guardian_child" to "supabase_auth_admin";

grant insert on table "public"."person_guardian_child" to "supabase_auth_admin";

grant references on table "public"."person_guardian_child" to "supabase_auth_admin";

grant select on table "public"."person_guardian_child" to "supabase_auth_admin";

grant trigger on table "public"."person_guardian_child" to "supabase_auth_admin";

grant truncate on table "public"."person_guardian_child" to "supabase_auth_admin";

grant update on table "public"."person_guardian_child" to "supabase_auth_admin";

grant insert on table "public"."profile" to "authenticated";

grant select on table "public"."profile" to "authenticated";

grant update on table "public"."profile" to "authenticated";

grant delete on table "public"."profile" to "service_role";

grant insert on table "public"."profile" to "service_role";

grant references on table "public"."profile" to "service_role";

grant select on table "public"."profile" to "service_role";

grant trigger on table "public"."profile" to "service_role";

grant truncate on table "public"."profile" to "service_role";

grant update on table "public"."profile" to "service_role";

grant delete on table "public"."profile" to "supabase_auth_admin";

grant insert on table "public"."profile" to "supabase_auth_admin";

grant references on table "public"."profile" to "supabase_auth_admin";

grant select on table "public"."profile" to "supabase_auth_admin";

grant trigger on table "public"."profile" to "supabase_auth_admin";

grant truncate on table "public"."profile" to "supabase_auth_admin";

grant update on table "public"."profile" to "supabase_auth_admin";

grant delete on table "public"."semester" to "authenticated";

grant insert on table "public"."semester" to "authenticated";

grant references on table "public"."semester" to "authenticated";

grant select on table "public"."semester" to "authenticated";

grant trigger on table "public"."semester" to "authenticated";

grant truncate on table "public"."semester" to "authenticated";

grant update on table "public"."semester" to "authenticated";

grant delete on table "public"."semester" to "service_role";

grant insert on table "public"."semester" to "service_role";

grant references on table "public"."semester" to "service_role";

grant select on table "public"."semester" to "service_role";

grant trigger on table "public"."semester" to "service_role";

grant truncate on table "public"."semester" to "service_role";

grant update on table "public"."semester" to "service_role";

grant delete on table "public"."semester" to "supabase_auth_admin";

grant insert on table "public"."semester" to "supabase_auth_admin";

grant references on table "public"."semester" to "supabase_auth_admin";

grant select on table "public"."semester" to "supabase_auth_admin";

grant trigger on table "public"."semester" to "supabase_auth_admin";

grant truncate on table "public"."semester" to "supabase_auth_admin";

grant update on table "public"."semester" to "supabase_auth_admin";

grant delete on table "public"."session_attendance" to "authenticated";

grant insert on table "public"."session_attendance" to "authenticated";

grant references on table "public"."session_attendance" to "authenticated";

grant select on table "public"."session_attendance" to "authenticated";

grant trigger on table "public"."session_attendance" to "authenticated";

grant truncate on table "public"."session_attendance" to "authenticated";

grant update on table "public"."session_attendance" to "authenticated";

grant delete on table "public"."session_attendance" to "service_role";

grant insert on table "public"."session_attendance" to "service_role";

grant references on table "public"."session_attendance" to "service_role";

grant select on table "public"."session_attendance" to "service_role";

grant trigger on table "public"."session_attendance" to "service_role";

grant truncate on table "public"."session_attendance" to "service_role";

grant update on table "public"."session_attendance" to "service_role";

grant delete on table "public"."session_attendance" to "supabase_auth_admin";

grant insert on table "public"."session_attendance" to "supabase_auth_admin";

grant references on table "public"."session_attendance" to "supabase_auth_admin";

grant select on table "public"."session_attendance" to "supabase_auth_admin";

grant trigger on table "public"."session_attendance" to "supabase_auth_admin";

grant truncate on table "public"."session_attendance" to "supabase_auth_admin";

grant update on table "public"."session_attendance" to "supabase_auth_admin";


  create policy "form_question_map_assignee_read"
  on "public"."form_question_map"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM public.form_assignment fa
  WHERE ((fa.form_id = form_question_map.form_id) AND (fa.user_id = auth.uid())))));



  create policy "form_question_map_delete_authorized"
  on "public"."form_question_map"
  as permissive
  for delete
  to public
using (public.authorize('form_question_map.delete'::public.app_permissions));



  create policy "form_question_map_insert_authorized"
  on "public"."form_question_map"
  as permissive
  for insert
  to public
with check (public.authorize('form_question_map.create'::public.app_permissions));



  create policy "form_question_map_read_auth_admin"
  on "public"."form_question_map"
  as permissive
  for select
  to supabase_auth_admin
using (true);



  create policy "form_question_map_select_authorized"
  on "public"."form_question_map"
  as permissive
  for select
  to public
using (public.authorize('form_question_map.read'::public.app_permissions));



  create policy "form_question_map_update_authorized"
  on "public"."form_question_map"
  as permissive
  for update
  to public
using (public.authorize('form_question_map.update'::public.app_permissions))
with check (public.authorize('form_question_map.update'::public.app_permissions));



  create policy "person_guardian_child_insert_guardian"
  on "public"."person_guardian_child"
  as permissive
  for insert
  to public
with check ((guardian_profile_id IN ( SELECT p.id
   FROM public.profile p
  WHERE (p.user_id = auth.uid()))));



  create policy "person_guardian_child_read_auth_admin"
  on "public"."person_guardian_child"
  as permissive
  for select
  to supabase_auth_admin
using (true);



  create policy "person_guardian_child_read_guardian"
  on "public"."person_guardian_child"
  as permissive
  for select
  to public
using (((guardian_profile_id IN ( SELECT p.id
   FROM public.profile p
  WHERE (p.user_id = auth.uid()))) OR (child_profile_id IN ( SELECT pgc.child_profile_id
   FROM (public.person_guardian_child pgc
     JOIN public.profile p ON ((p.id = pgc.guardian_profile_id)))
  WHERE (p.user_id = auth.uid())))));



  create policy "person_guardian_child_update_guardian"
  on "public"."person_guardian_child"
  as permissive
  for update
  to public
using ((guardian_profile_id IN ( SELECT p.id
   FROM public.profile p
  WHERE (p.user_id = auth.uid()))))
with check ((guardian_profile_id IN ( SELECT p.id
   FROM public.profile p
  WHERE (p.user_id = auth.uid()))));



  create policy "profile_insert_self_or_child"
  on "public"."profile"
  as permissive
  for insert
  to public
with check (((user_id = auth.uid()) OR (user_id IS NULL)));



  create policy "profile_read_auth_admin"
  on "public"."profile"
  as permissive
  for select
  to supabase_auth_admin
using (true);



  create policy "profile_read_guardian_child"
  on "public"."profile"
  as permissive
  for select
  to public
using ((id IN ( SELECT pgc.child_profile_id
   FROM (public.person_guardian_child pgc
     JOIN public.profile p ON ((p.id = pgc.guardian_profile_id)))
  WHERE (p.user_id = auth.uid()))));



  create policy "profile_read_self"
  on "public"."profile"
  as permissive
  for select
  to public
using ((user_id = auth.uid()));



  create policy "profile_update_self"
  on "public"."profile"
  as permissive
  for update
  to public
using ((user_id = auth.uid()))
with check ((user_id = auth.uid()));



  create policy "semester_delete_admin"
  on "public"."semester"
  as permissive
  for delete
  to public
using (public.authorize('semester.delete'::public.app_permissions));



  create policy "semester_insert_admin"
  on "public"."semester"
  as permissive
  for insert
  to public
with check (public.authorize('semester.create'::public.app_permissions));



  create policy "semester_read_auth_admin"
  on "public"."semester"
  as permissive
  for select
  to supabase_auth_admin
using (true);



  create policy "semester_select_all"
  on "public"."semester"
  as permissive
  for select
  to public
using (true);



  create policy "semester_update_admin"
  on "public"."semester"
  as permissive
  for update
  to public
using (public.authorize('semester.update'::public.app_permissions))
with check (public.authorize('semester.update'::public.app_permissions));



  create policy "session_attendance_delete_admin"
  on "public"."session_attendance"
  as permissive
  for delete
  to public
using (public.authorize('session_attendance.delete'::public.app_permissions));



  create policy "session_attendance_insert_admin"
  on "public"."session_attendance"
  as permissive
  for insert
  to public
with check (public.authorize('session_attendance.create'::public.app_permissions));



  create policy "session_attendance_read_auth_admin"
  on "public"."session_attendance"
  as permissive
  for select
  to supabase_auth_admin
using (true);



  create policy "session_attendance_select_admin"
  on "public"."session_attendance"
  as permissive
  for select
  to public
using (public.authorize('session_attendance.read'::public.app_permissions));



  create policy "session_attendance_update_admin"
  on "public"."session_attendance"
  as permissive
  for update
  to public
using (public.authorize('session_attendance.update'::public.app_permissions))
with check (public.authorize('session_attendance.update'::public.app_permissions));



  create policy "form_question_assignee_read"
  on "public"."form_question"
  as permissive
  for select
  to public
using ((EXISTS ( SELECT 1
   FROM (public.form_question_map fqm
     JOIN public.form_assignment fa ON ((fa.form_id = fqm.form_id)))
  WHERE ((fqm.question_code = form_question.question_code) AND (fa.user_id = auth.uid())))));



  create policy "workshop_enrollment_insert_self"
  on "public"."workshop_enrollment"
  as permissive
  for insert
  to public
with check (((profile_id IN ( SELECT p.id
   FROM public.profile p
  WHERE (p.user_id = auth.uid()))) AND (COALESCE(status, 'pending'::public.workshop_enrollment_status) = 'pending'::public.workshop_enrollment_status)));



  create policy "workshop_enrollment_select_self"
  on "public"."workshop_enrollment"
  as permissive
  for select
  to public
using ((profile_id IN ( SELECT p.id
   FROM public.profile p
  WHERE (p.user_id = auth.uid()))));


CREATE TRIGGER on_profile_updated_set_timestamp BEFORE UPDATE ON public.profile FOR EACH ROW EXECUTE FUNCTION public.touch_profile_updated_at();

CREATE TRIGGER on_semester_updated_set_timestamp BEFORE UPDATE ON public.semester FOR EACH ROW EXECUTE FUNCTION public.touch_semester_updated_at();

CREATE TRIGGER on_session_attendance_updated_set_timestamp BEFORE UPDATE ON public.session_attendance FOR EACH ROW EXECUTE FUNCTION public.touch_session_attendance_updated_at();

CREATE TRIGGER on_workshop_enrollment_set_semester_id BEFORE INSERT OR UPDATE OF workshop_id ON public.workshop_enrollment FOR EACH ROW EXECUTE FUNCTION public.set_workshop_enrollment_semester_id();

drop trigger if exists "on_auth_user_created_create_profile" on "auth"."users";
